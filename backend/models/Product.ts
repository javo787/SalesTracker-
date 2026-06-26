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
});

// Composite index for efficient upserting during sync
ProductSchema.index({ shopId: 1, localId: 1 }, { unique: true });

export default mongoose.model<IProduct>('Product', ProductSchema);
