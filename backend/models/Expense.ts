import mongoose, { Schema, Document } from 'mongoose';

export interface IExpense extends Document {
  shopId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  sellerName: string;
  localId: number;
  type: string;           // 'operational' | 'inventory'
  category: string;
  amount: number;
  description?: string;
  linkedProductId?: number | null;
  created_at: string;
  serverUpdatedAt: Date;
}

const ExpenseSchema: Schema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sellerName: { type: String, required: true },
  localId: { type: Number, required: true },
  type: { type: String, required: true },
  category: { type: String, required: true },
  amount: { type: Number, required: true },
  description: { type: String },
  linkedProductId: { type: Number, default: null },
  created_at: { type: String },
  serverUpdatedAt: { type: Date, default: Date.now },
});

ExpenseSchema.index({ shopId: 1, sellerId: 1, localId: 1 }, { unique: true });
ExpenseSchema.index({ shopId: 1, serverUpdatedAt: 1 });

export default mongoose.model<IExpense>('Expense', ExpenseSchema);
