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
  permissions: string[];     // делегированные права для role='seller'; owner не хранит — у него всё неявно
}

const ShopMemberSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'seller'], required: true },
  displayName: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now },
  permissions: { type: [String], default: [] },
});

// One user - one active shop (allows historical inactive records)
ShopMemberSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
ShopMemberSchema.index({ shopId: 1, isActive: 1 });

const ShopMember = mongoose.model<IShopMember>('ShopMember', ShopMemberSchema);

// Safely handle index creation errors (e.g. if an old index exists in production)
ShopMember.on('index', (error) => {
  if (error) {
    console.error('ShopMember index error:', error);
  }
});

export default ShopMember;
