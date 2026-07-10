import mongoose, { Schema, Document } from 'mongoose';

export type ShopAuditAction =
  | 'member_joined'
  | 'member_removed'
  | 'ownership_transferred'
  | 'invite_code_regenerated'
  | 'member_left'
  | 'checkin_settings_updated';

export interface IShopAuditLog extends Document {
  shopId: mongoose.Types.ObjectId;
  actorUserId: mongoose.Types.ObjectId;   // кто выполнил действие
  actorName: string;                      // имя на момент действия (кэш)
  action: ShopAuditAction;
  targetUserId?: mongoose.Types.ObjectId; // на кого действие направлено (если применимо)
  targetName?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const ShopAuditLogSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true },
  action: {
    type: String,
    enum: ['member_joined', 'member_removed', 'ownership_transferred', 'invite_code_regenerated', 'member_left', 'checkin_settings_updated'],
    required: true,
  },
  targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  targetName: { type: String },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

ShopAuditLogSchema.index({ shopId: 1, createdAt: -1 });

export default mongoose.model<IShopAuditLog>('ShopAuditLog', ShopAuditLogSchema);
