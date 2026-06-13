import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  authProvider: 'google' | 'email' | 'telegram' | 'anonymous';
  email?: string;
  passwordHash?: string;
  googleId?: string;
  telegramId?: string;
  telegramUsername?: string;
  name: string;
  avatarUrl?: string;
  referralCode: string;
  referredBy?: mongoose.Types.ObjectId;
  referralCount: number;
  createdAt: Date;
  lastSyncAt: Date;
}

const UserSchema: Schema = new Schema({
  authProvider: { type: String, enum: ['google', 'email', 'telegram', 'anonymous'], required: true },
  email: { type: String, unique: true, sparse: true },
  passwordHash: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  telegramId: { type: String, unique: true, sparse: true },
  telegramUsername: { type: String },
  name: { type: String, required: true },
  avatarUrl: { type: String },
  referralCode: { type: String, unique: true, required: true },
  referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  referralCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastSyncAt: { type: Date, default: Date.now },
});

export default mongoose.model<IUser>('User', UserSchema);
