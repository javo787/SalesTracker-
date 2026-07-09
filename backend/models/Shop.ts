import mongoose, { Schema, Document } from 'mongoose';

export interface IShop extends Document {
  name: string;
  ownerId: mongoose.Types.ObjectId;
  inviteCode: string;       // 6 symbols A-Z0-9, unique
  inviteCodeExpiresAt?: Date; // код действителен 7 дней с момента (пере)генерации
  isActive: boolean;
  createdAt: Date;
}

const ShopSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  inviteCode: { type: String, required: true, unique: true, uppercase: true, length: 6 },
  inviteCodeExpiresAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

ShopSchema.index({ ownerId: 1 });
ShopSchema.index({ inviteCode: 1 });

export default mongoose.model<IShop>('Shop', ShopSchema);
