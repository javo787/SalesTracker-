import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { api } from './api';
import { getProducts, getProductsForSync, getSalesByPeriod, getShopSession, getUnsyncedSales } from '../db/database';
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('savdo.db'); // Note: Keeping database name 'savdo.db' to avoid data loss as per instructions.
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
      const isOwner = session.role === 'owner';
      const salesToSend = getUnsyncedSales();
      const productsToSend = isOwner ? getProductsForSync() : [];

      const payload: any = {
        sales: salesToSend,
      };

      if (isOwner) {
        payload.products = productsToSend;
      }

      const result = await api.post<{ syncedAt: string }>('/sync/push', payload);
      await AsyncStorage.setItem('last_sync_at', result.syncedAt);

      // Locally mark the successfully pushed items as synced
      db.withTransactionSync(() => {
        for (const s of salesToSend as any[]) {
          db.runSync('UPDATE sales SET synced = 1 WHERE id = ?', [s.id]);
        }
        for (const p of productsToSend as any[]) {
          db.runSync('UPDATE products SET synced = 1 WHERE id = ?', [p.id]);
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

      const data = await api.get<{
        products: any[];
        sales: any[];
        role: string;
        asOf: string;
      }>(url);

      // Products sync
      for (const p of data.products) {
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

      // Sales sync
      for (const s of data.sales) {
        const existing = db.getFirstSync('SELECT id FROM sales WHERE id = ?', [s.localId]);
        if (!existing) {
          db.runSync(
            `INSERT INTO sales (
              id, product_id, product_name, quantity, sell_price, buy_price, profit,
              note, stock_updated, created_at, seller_id, seller_name, stock_warning, synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              s.localId, s.product_id, s.product_name, s.quantity,
              s.sell_price,
              isOwner ? s.buy_price : null,
              isOwner ? s.profit : null,
              s.note, s.stock_updated, s.created_at,
              s.sellerId, s.sellerName,
              s.stock_warning ? 1 : 0
            ]
          );
        } else {
          // Keep local sync status clean
          db.runSync('UPDATE sales SET synced = 1 WHERE id = ?', [s.localId]);
        }
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
        SyncService.pull().then(() => SyncService.push());
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
