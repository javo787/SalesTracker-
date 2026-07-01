import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { api } from './api';
import { getProducts, getProductsForSync, getSalesByPeriod, getShopSession } from '../db/database';
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('savdo.db');
let isSyncing = false;

export const SyncService = {
  async push(): Promise<void> {
    if (isSyncing) return;
    const session = getShopSession();
    if (!session.shopId) return;

    const syncEnabled = await AsyncStorage.getItem('sync_enabled');
    if (syncEnabled === 'false') return;

    isSyncing = true;
    try {
      const isOwner = session.role === 'owner';
      const payload: any = {
        sales: getSalesByPeriod(3650),
      };

      if (isOwner) {
        payload.products = getProductsForSync();
      }

      const result = await api.post<{ syncedAt: string }>('/sync/push', payload);
      await AsyncStorage.setItem('last_sync_at', result.syncedAt);
    } catch (error) {
      console.warn('Sync push failed:', error);
    } finally {
      isSyncing = false;
    }
  },

  async pull(): Promise<void> {
    if (isSyncing) return;
    const session = getShopSession();
    if (!session.shopId) return;

    const syncEnabled = await AsyncStorage.getItem('sync_enabled');
    if (syncEnabled === 'false') return;

    isSyncing = true;
    try {
      const isOwner = session.role === 'owner';
      const data = await api.get<{
        products: any[];
        sales: any[];
        role: string;
      }>('/sync/pull');

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
              note, stock_updated, created_at, seller_id, seller_name, stock_warning
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        }
      }
    } catch (error) {
      console.warn('Sync pull failed:', error);
    } finally {
      isSyncing = false;
    }
  },

  initAutoSync() {
    AppState.addEventListener('change', async (nextAppState) => {
      const syncEnabled = await AsyncStorage.getItem('sync_enabled');
      if (syncEnabled === 'false') return;

      if (nextAppState === 'active') {
        this.pull().then(() => this.push());
      } else if (nextAppState === 'background') {
        this.push();
      }
    });
  },
};
