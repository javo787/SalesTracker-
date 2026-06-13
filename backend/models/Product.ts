import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  userId: mongoose.Types.ObjectId;
  localId: number;
  name: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  min_stock_alert: number;
  created_at: string;
}

const ProductSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  localId: { type: Number, required: true },
  name: { type: String, required: true },
  buy_price: { type: Number, required: true },
  sell_price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  min_stock_alert: { type: Number, default: 0 },
  created_at: { type: String },
});

// Composite index for efficient upserting during sync
ProductSchema.index({ userId: 1, localId: 1 }, { unique: true });

export default mongoose.model<IProduct>('Product', ProductSchema);
