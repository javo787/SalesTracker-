import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { api } from './api';
import { getProducts, getSalesByPeriod } from '../db/database';
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('savdo.db');

export const SyncService = {
  async push(): Promise<void> {
    try {
      const products = getProducts();
      // Push all sales for now, backend handles upserts
      const sales = getSalesByPeriod(3650);

      const result = await api.post<{ syncedAt: string }>('/sync/push', { sales, products });
      await AsyncStorage.setItem('last_sync_at', result.syncedAt);
    } catch (error) {
      console.warn('Sync push failed:', error);
    }
  },

  async pull(): Promise<void> {
    try {
      const data = await api.get<{ products: any[], sales: any[] }>('/sync/pull');

      // Sync products
      for (const p of data.products) {
        const existing = db.getFirstSync('SELECT id FROM products WHERE id = ?', [p.localId]);
        if (!existing) {
          db.runSync(
            'INSERT INTO products (id, name, buy_price, sell_price, stock, min_stock_alert, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [p.localId, p.name, p.buy_price, p.sell_price, p.stock, p.min_stock_alert, p.created_at]
          );
        }
      }

      // Sync sales
      for (const s of data.sales) {
        const existing = db.getFirstSync('SELECT id FROM sales WHERE id = ?', [s.localId]);
        if (!existing) {
          db.runSync(
            'INSERT INTO sales (id, product_id, product_name, quantity, sell_price, buy_price, profit, note, stock_updated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [s.localId, s.product_id, s.product_name, s.quantity, s.sell_price, s.buy_price, s.profit, s.note, s.stock_updated, s.created_at]
          );
        }
      }
    } catch (error) {
      console.warn('Sync pull failed:', error);
    }
  },

  initAutoSync() {
    AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        this.push();
      }
    });
  }
};
