import mongoose, { Schema, Document } from 'mongoose';

export type ShopRole = 'owner' | 'seller';

export interface IShopMember extends Document {
  shopId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: ShopRole;
  displayName: string;       // name cache for quick queries
  isActive: boolean;         // false = seller blocked by owner
  joinedAt: Date;
  lastActiveAt: Date;
}

const ShopMemberSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'seller'], required: true },
  displayName: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now },
});

// One user - one shop (in current version)
ShopMemberSchema.index({ userId: 1 }, { unique: true });
ShopMemberSchema.index({ shopId: 1, isActive: 1 });

export default mongoose.model<IShopMember>('ShopMember', ShopMemberSchema);
