import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  shopId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  localId: number;
  name: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  min_stock_alert: number;
  base_unit: string;
  has_packages: number;
  package_name?: string;
  units_per_package: number;
  category?: string;
  created_at: string;
  updated_at: string;
  is_deleted: number;
  serverUpdatedAt: Date;
}

const ProductSchema: Schema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  localId: { type: Number, required: true },
  name: { type: String, required: true },
  buy_price: { type: Number, required: true },
  sell_price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  min_stock_alert: { type: Number, default: 0 },
  base_unit: { type: String, default: 'шт' },
  has_packages: { type: Number, default: 0 },
  package_name: { type: String },
  units_per_package: { type: Number, default: 1 },
  category: { type: String },
  created_at: { type: String },
  updated_at: { type: String },
  is_deleted: { type: Number, default: 0 },
  // Серверная авторитетная метка времени последнего изменения (UTC, тип Date).
  // Используется ТОЛЬКО для дельта-синхронизации (/sync/pull ?since=...).
  // Клиентское поле updated_at — это локальное время устройства владельца
  // в формате "YYYY-MM-DD HH:MM:SS" (без TZ) и НЕ подходит для сравнения
  // со строкой since (которая приходит в полном ISO 8601 формате с 'T'/'Z'):
  // лексикографическое сравнение таких строк даёт неверный результат.
  serverUpdatedAt: { type: Date, default: Date.now },
});

// Composite index for efficient upserting during sync
ProductSchema.index({ shopId: 1, localId: 1 }, { unique: true });
ProductSchema.index({ shopId: 1, serverUpdatedAt: 1 });

export default mongoose.model<IProduct>('Product', ProductSchema);
