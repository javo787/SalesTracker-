import mongoose, { Schema, Document } from 'mongoose';

export interface ISale extends Document {
  shopId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sellerName: string;
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
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sellerName: { type: String, required: true },
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
SaleSchema.index({ shopId: 1, sellerId: 1, localId: 1 }, { unique: true });
SaleSchema.index({ shopId: 1, created_at: -1 });

export default mongoose.model<ISale>('Sale', SaleSchema);
