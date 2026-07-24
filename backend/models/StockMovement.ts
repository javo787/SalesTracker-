import mongoose, { Schema, Document } from 'mongoose';

export interface IStockMovement extends Document {
  shopId: mongoose.Types.ObjectId;
  productLocalId: number;
  clientId: string; // UUID сгенерированный на клиенте (crypto.randomUUID) — дедуп-ключ
  type: 'stock_in' | 'waste' | 'correction' | 'edit';
  quantityChange: number;
  pricePerUnit: number | null;
  note?: string;
  sellerId?: mongoose.Types.ObjectId;
  sellerName?: string;
  createdAt: string; // локальное время устройства-автора, для отображения
  serverCreatedAt: Date; // серверная авторитетная метка — только для дельта-синка
}

const StockMovementSchema: Schema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  productLocalId: { type: Number, required: true },
  clientId: { type: String, required: true },
  type: { type: String, required: true, enum: ['stock_in', 'waste', 'correction', 'edit'] },
  quantityChange: { type: Number, required: true },
  pricePerUnit: { type: Number, default: null },
  note: { type: String },
  sellerId: { type: Schema.Types.ObjectId, ref: 'User' },
  sellerName: { type: String },
  createdAt: { type: String },
  serverCreatedAt: { type: Date, default: Date.now },
});

// Движения неизменяемы (append-only) — один и тот же clientId от одного и
// того же магазина не должен продублироваться при повторном push (retry,
// авторетрай withRetry на фронте и т.п.).
StockMovementSchema.index({ shopId: 1, clientId: 1 }, { unique: true });
StockMovementSchema.index({ shopId: 1, serverCreatedAt: 1 });
StockMovementSchema.index({ shopId: 1, productLocalId: 1 });

export default mongoose.model<IStockMovement>('StockMovement', StockMovementSchema);
