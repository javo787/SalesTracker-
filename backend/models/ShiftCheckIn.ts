import mongoose, { Schema, Document } from 'mongoose';

export interface IShiftCheckIn extends Document {
  shopId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sellerName: string;          // cache, same pattern as ShopMember.displayName
  localDate: string;           // 'YYYY-MM-DD', provided by the client from device local time
  methodsUsed: Array<{
    method: 'gps' | 'nfc' | 'qr';
    at: Date;
    gpsDistanceMeters?: number;   // only for method='gps', computed server-side
  }>;
  status: 'confirmed' | 'partial';   // 'partial' only possible when shop's verificationMode was 'two_factor' at time of first check-in
  requiredMethodsCount: 1 | 2;       // snapshot of what was required at check-in time
  ownerOverride: boolean;            // true if set via manual owner confirmation
  overrideBy?: mongoose.Types.ObjectId | null; // the owner userId who performed a manual override, null if none
  overrideAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ShiftCheckInSchema = new Schema({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sellerName: { type: String, required: true },
  localDate: { type: String, required: true },
  methodsUsed: [{
    method: { type: String, enum: ['gps', 'nfc', 'qr'], required: true },
    at: { type: Date, default: Date.now },
    gpsDistanceMeters: { type: Number },
  }],
  status: { type: String, enum: ['confirmed', 'partial'], required: true },
  requiredMethodsCount: { type: Number, enum: [1, 2], required: true },
  ownerOverride: { type: Boolean, default: false },
  overrideBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  overrideAt: { type: Schema.Types.Date, default: null },
}, { timestamps: true });

// Unique index on { shopId, userId, localDate } — one record per seller per shop per local day
ShiftCheckInSchema.index({ shopId: 1, userId: 1, localDate: 1 }, { unique: true });

const ShiftCheckIn = mongoose.model<IShiftCheckIn>('ShiftCheckIn', ShiftCheckInSchema);

export default ShiftCheckIn;
