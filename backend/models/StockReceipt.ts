import mongoose, { Schema, Document } from 'mongoose';

export interface IStockReceipt extends Document {
  shopId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  sellerName: string;
  productName: string;
  quantity: number;
  unit?: string;
  pricePerUnit?: number;
  note?: string;
  notified: boolean;
  createdAt: Date;
}

const StockReceiptSchema = new Schema<IStockReceipt>({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sellerName: { type: String, required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String },
  pricePerUnit: { type: Number },
  note: { type: String },
  notified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

StockReceiptSchema.index({ shopId: 1, notified: 1 });

export default mongoose.model<IStockReceipt>('StockReceipt', StockReceiptSchema);
