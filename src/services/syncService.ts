import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { api } from './api';
import { getProducts, getProductsForSync, getSalesByPeriod, getShopSession, getUnsyncedSales, getUnsyncedExpenses, getUnsyncedCheckIn, updateCheckInSyncResult } from '../db/database';
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('savdo.db'); // Note: Keeping database name 'savdo.db' to avoid data loss as per instructions.

// Повторяет запрос при 5xx/503 (в т.ч. от load-shedding на бэкенде) или сетевой ошибке,
// с растущей паузой между попытками. 4xx (401/403 и т.п.) не ретраятся — это не транспортная проблема.
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const isRetryable = !err.status || err.status >= 500;
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
let isSyncing = false;
let pushTimeout: NodeJS.Timeout | null = null;

// --- Лёгкий pub-sub статуса синхронизации (только для UI-индикатора,
// на логику push/pull не влияет) ---
type SyncStatusListener = (isSyncing: boolean) => void;
const statusListeners = new Set<SyncStatusListener>();

function setSyncingStatus(value: boolean) {
  isSyncing = value;
  statusListeners.forEach(listener => listener(value));
}

export const SyncService = {
  subscribe(listener: SyncStatusListener): () => void {
    statusListeners.add(listener);
    listener(isSyncing);
    return () => statusListeners.delete(listener);
  },

  getIsSyncing(): boolean {
    return isSyncing;
  },

  async push(): Promise<void> {
    if (isSyncing) return;
    const session = getShopSession();
    if (!session.shopId) return;

    const syncEnabled = await AsyncStorage.getItem('sync_enabled');
    if (syncEnabled === 'false') return;

    setSyncingStatus(true);
    try {
      // Process unsynced check-ins if any (offline check-in queue retry)
      // We choose to send the unsynced check-in directly via a POST to /shop/checkin inside the push function.
      // This is less invasive to the existing sync structure, prevents modifying the complex bulk sync endpoint on the server,
      // and handles individual check-in validation and status responses cleanly.
      const unsyncedCheckIn = getUnsyncedCheckIn();
      if (unsyncedCheckIn) {
        try {
          const bodyPayload: any = {};
          if (unsyncedCheckIn.method === 'gps') {
            bodyPayload.gps = { latitude: unsyncedCheckIn.gps_lat, longitude: unsyncedCheckIn.gps_lng };
          } else if (unsyncedCheckIn.method === 'nfc') {
            bodyPayload.nfcTagUid = unsyncedCheckIn.nfc_tag_uid;
          } else if (unsyncedCheckIn.method === 'qr') {
            bodyPayload.qrToken = unsyncedCheckIn.qr_token;
          }

          const res = await api.post<any>('/shop/checkin', {
            method: unsyncedCheckIn.method,
            localDate: unsyncedCheckIn.local_date,
            ...bodyPayload,
          });

          updateCheckInSyncResult(res.status, null, 1);
        } catch (err: any) {
          if (err.status >= 400 && err.status < 500) {
            // Definitively rejected by server
            updateCheckInSyncResult('rejected', err.code || err.message, 1);
          } else {
            // Temporary network/server error, keep synced=0 to retry later
          }
        }
      }

      const isOwner = session.role === 'owner';
      const salesToSend = getUnsyncedSales();
      const productsToSend = isOwner ? getProductsForSync() : [];
      const expensesToSend = getUnsyncedExpenses();

      const payload: any = {
        sales: salesToSend,
        expenses: expensesToSend,
      };

      if (isOwner) {
        payload.products = productsToSend;
      }

      const result = await withRetry(() => api.post<{ syncedAt: string }>('/sync/push', payload));
      await AsyncStorage.setItem('last_sync_at', result.syncedAt);

      // Locally mark the successfully pushed items as synced
      db.withTransactionSync(() => {
        for (const s of salesToSend as any[]) {
          db.runSync('UPDATE sales SET synced = 1 WHERE id = ?', [s.id]);
        }
        for (const p of productsToSend as any[]) {
          db.runSync('UPDATE products SET synced = 1 WHERE id = ?', [p.id]);
        }
        for (const e of expensesToSend as any[]) {
          db.runSync('UPDATE expenses SET synced = 1 WHERE id = ?', [e.id]);
        }
      });
    } catch (error) {
      console.warn('Sync push failed:', error);
    } finally {
      setSyncingStatus(false);
    }
  },

  async pull(): Promise<void> {
    if (isSyncing) return;
    const session = getShopSession();
    if (!session.shopId) return;

    const syncEnabled = await AsyncStorage.getItem('sync_enabled');
    if (syncEnabled === 'false') return;

    setSyncingStatus(true);
    try {
      const isOwner = session.role === 'owner';
      const lastPullAsOf = await AsyncStorage.getItem('last_pull_asOf');
      const url = lastPullAsOf ? `/sync/pull?since=${encodeURIComponent(lastPullAsOf)}` : '/sync/pull';

      const data = await withRetry(() => api.get<{
        products: any[];
        sales: any[];
        expenses: any[];
        role: string;
        asOf: string;
      }>(url));

      const CHUNK_SIZE = 300;
      function chunk<T>(arr: T[], size: number): T[][] {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      }

      // Products sync
      for (const batch of chunk(data.products, CHUNK_SIZE)) {
        db.withTransactionSync(() => {
          for (const p of batch) {
            // Use localId for mapping, NOT autoincrement id
            const existing = db.getFirstSync('SELECT id FROM products WHERE id = ?', [p.localId]);

            if (p.is_deleted) {
               db.runSync('DELETE FROM products WHERE id = ?', [p.localId]);
               continue;
            }

            if (!existing) {
              db.runSync(
                `INSERT INTO products (
                  id, name, buy_price, sell_price, stock, min_stock_alert,
                  base_unit, has_packages, package_name, units_per_package,
                  category, updated_at, synced, is_deleted, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
                [
                  p.localId, p.name,
                  isOwner ? p.buy_price : null,
                  p.sell_price, p.stock, p.min_stock_alert || 0,
                  p.base_unit || 'шт', p.has_packages || 0,
                  p.package_name, p.units_per_package || 1,
                  p.category, p.updated_at, p.is_deleted || 0, p.created_at
                ]
              );
            } else {
              db.runSync(
                `UPDATE products SET
                  name = ?,
                  ${isOwner ? 'buy_price = ?,' : 'buy_price = NULL,'}
                  sell_price = ?, stock = ?, min_stock_alert = ?,
                  base_unit = ?, category = ?, synced = 1, is_deleted = ?, updated_at = ?
                WHERE id = ?`,
                isOwner
                  ? [p.name, p.buy_price, p.sell_price, p.stock, p.min_stock_alert, p.base_unit, p.category, p.is_deleted || 0, p.updated_at, p.localId]
                  : [p.name, p.sell_price, p.stock, p.min_stock_alert, p.base_unit, p.category, p.is_deleted || 0, p.updated_at, p.localId]
              );
            }
          }
        });
        await new Promise(resolve => setTimeout(resolve, 0)); // yield to event loop between chunks
      }

      // Sales sync
      //
      // Bug fix: `id` on the local `sales` table is a per-device SQLite
      // AUTOINCREMENT counter, NOT a globally unique identifier — it's only
      // guaranteed unique per (shop, seller) on the server (see the
      // {shopId, sellerId, localId} unique index in backend/models/Sale.ts).
      // The old code matched/inserted incoming rows purely by
      // `id = s.localId`, so a seller's sale could collide with an unrelated
      // local row that happened to share the same numeric id on the owner's
      // device (e.g. the owner's own sale, or another seller's already-pulled
      // sale). When that happened the incoming sale was silently dropped —
      // the owner's device just marked the colliding row `synced = 1` instead
      // of inserting the seller's actual sale. Sales have high volume, so
      // collisions were common; expenses (much lower volume) rarely
      // collided, which is why the owner could see a seller's expenses but
      // not their sales.
      //
      // Fix: dedupe by the server's globally unique remote_id first. If this
      // device is the original author of the row (same local id AND same
      // seller_id, not yet tagged with a remote_id), just attach the
      // remote_id. Otherwise always insert as a brand-new local row with its
      // own fresh autoincrement id — never force `id = s.localId`.
      for (const batch of chunk(data.sales, CHUNK_SIZE)) {
        db.withTransactionSync(() => {
          for (const s of batch) {
            const remoteId = s._id ? String(s._id) : null;

            const byRemoteId = remoteId
              ? db.getFirstSync('SELECT id FROM sales WHERE remote_id = ?', [remoteId])
              : null;

            if (byRemoteId) {
              db.runSync('UPDATE sales SET synced = 1 WHERE remote_id = ?', [remoteId]);
              continue;
            }

            const ownUnlinkedRow = s.localId
              ? db.getFirstSync(
                  'SELECT id FROM sales WHERE id = ? AND seller_id = ? AND remote_id IS NULL',
                  [s.localId, s.sellerId]
                )
              : null;

            if (ownUnlinkedRow) {
              db.runSync('UPDATE sales SET remote_id = ?, synced = 1 WHERE id = ?', [remoteId, s.localId]);
              continue;
            }

            db.runSync(
              `INSERT INTO sales (
                product_id, product_name, quantity, sell_price, buy_price, profit,
                note, stock_updated, created_at, seller_id, seller_name, stock_warning,
                remote_id, synced
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
              [
                s.product_id, s.product_name, s.quantity,
                s.sell_price,
                isOwner ? s.buy_price : null,
                isOwner ? s.profit : null,
                s.note, s.stock_updated, s.created_at,
                s.sellerId, s.sellerName,
                s.stock_warning ? 1 : 0,
                remoteId,
              ]
            );
          }
        });
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Expenses sync — same dedupe-by-remote_id fix as sales above, since
      // expenses were exposed to the exact same local-id collision risk
      // (just less likely to trigger in practice due to lower volume).
      for (const batch of chunk(data.expenses || [], CHUNK_SIZE)) {
        db.withTransactionSync(() => {
          for (const e of batch) {
            const remoteId = e._id ? String(e._id) : null;

            const byRemoteId = remoteId
              ? db.getFirstSync('SELECT id FROM expenses WHERE remote_id = ?', [remoteId])
              : null;

            if (byRemoteId) {
              db.runSync('UPDATE expenses SET synced = 1 WHERE remote_id = ?', [remoteId]);
              continue;
            }

            const ownUnlinkedRow = e.localId
              ? db.getFirstSync(
                  'SELECT id FROM expenses WHERE id = ? AND seller_id = ? AND remote_id IS NULL',
                  [e.localId, e.sellerId]
                )
              : null;

            if (ownUnlinkedRow) {
              db.runSync('UPDATE expenses SET remote_id = ?, synced = 1 WHERE id = ?', [remoteId, e.localId]);
              continue;
            }

            db.runSync(
              `INSERT INTO expenses (
                type, category, amount, description, linked_product_id, created_at,
                user_id, seller_id, seller_name, remote_id, synced
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
              [
                e.type, e.category, e.amount, e.description || null,
                e.linked_product_id || null, e.created_at,
                e.sellerId, e.sellerId, e.sellerName, remoteId,
              ]
            );
          }
        });
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      if (data.asOf) {
        await AsyncStorage.setItem('last_pull_asOf', data.asOf);
      }
    } catch (error) {
      console.warn('Sync pull failed:', error);
    } finally {
      setSyncingStatus(false);
    }
  },

  pushDebounced() {
    if (pushTimeout) {
      clearTimeout(pushTimeout);
    }
    pushTimeout = setTimeout(() => {
      SyncService.push().catch(err => {
        console.warn('Debounced push failed:', err);
      });
    }, 4000); // 4 seconds debounce
  },

  initAutoSync() {
    AppState.addEventListener('change', async (nextAppState) => {
      const syncEnabled = await AsyncStorage.getItem('sync_enabled');
      if (syncEnabled === 'false') return;

      if (nextAppState === 'active') {
        const jitterMs = Math.random() * 4000; // 0-4 сек, сглаживает всплеск после push-рассылки
        setTimeout(() => {
          SyncService.pull().then(() => SyncService.push());
        }, jitterMs);
      } else if (nextAppState === 'background') {
        if (pushTimeout) {
          clearTimeout(pushTimeout);
          pushTimeout = null;
        }
        SyncService.push();
      }
    });
  },
};
