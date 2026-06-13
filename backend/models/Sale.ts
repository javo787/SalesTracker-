import mongoose, { Schema, Document } from 'mongoose';

export interface ISale extends Document {
  userId: mongoose.Types.ObjectId;
  localId: number;
  product_id: number | null;
  product_name: string;
  quantity: number;
  sell_price: number;
  buy_price: number;
  profit: number;
  note?: string;
  stock_updated: number;
  created_at: string;
}

const SaleSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  localId: { type: Number, required: true },
  product_id: { type: Number, default: null },
  product_name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  sell_price: { type: Number, required: true },
  buy_price: { type: Number, required: true },
  profit: { type: Number, required: true },
  note: { type: String },
  stock_updated: { type: Number, default: 0 },
  created_at: { type: String },
});

// Composite index for efficient upserting during sync
SaleSchema.index({ userId: 1, localId: 1 }, { unique: true });

export default mongoose.model<ISale>('Sale', SaleSchema);
