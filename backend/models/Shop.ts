import mongoose, { Schema, Document } from 'mongoose';

export interface ICheckInSettings {
  enabled: boolean;
  verificationMode: 'any' | 'two_factor';
  gps: {
    enabled: boolean;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
  };
  nfc: {
    enabled: boolean;
    tagUidHash: string | null;
    registeredAt: Date | null;
  };
  qr: {
    enabled: boolean;
    currentToken: string | null;
    rotation: 'static' | 'daily';
    tokenGeneratedAt: Date | null;
  };
}

export interface IShop extends Document {
  name: string;
  ownerId: mongoose.Types.ObjectId;
  inviteCode: string;       // 6 symbols A-Z0-9, unique
  inviteCodeExpiresAt?: Date; // код действителен 7 дней с момента (пере)генерации
  isActive: boolean;
  createdAt: Date;
  checkInSettings?: ICheckInSettings;
}

const CheckInSettingsSchema = new Schema({
  enabled: { type: Boolean, default: false },
  verificationMode: { type: String, enum: ['any', 'two_factor'], default: 'any' },
  gps: {
    enabled: { type: Boolean, default: false },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    radiusMeters: { type: Number, default: 100 },
  },
  nfc: {
    enabled: { type: Boolean, default: false },
    tagUidHash: { type: String, default: null },
    registeredAt: { type: Date, default: null },
  },
  qr: {
    enabled: { type: Boolean, default: false },
    currentToken: { type: String, default: null },
    rotation: { type: String, enum: ['static', 'daily'], default: 'static' },
    tokenGeneratedAt: { type: Date, default: null },
  }
}, { _id: false });

const ShopSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  inviteCode: { type: String, required: true, unique: true, uppercase: true, length: 6 },
  inviteCodeExpiresAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  checkInSettings: { type: CheckInSettingsSchema, default: () => ({}) },
});

ShopSchema.index({ ownerId: 1 });
ShopSchema.index({ inviteCode: 1 });

export default mongoose.model<IShop>('Shop', ShopSchema);
