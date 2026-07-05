import mongoose, { Schema, Document } from 'mongoose';

export interface IAccountDeletionRequest extends Document {
  identifier: string;   // email, Telegram username или телефон — как пользователь себя назвал
  reason?: string;
  status: 'pending' | 'done';
  createdAt: Date;
}

const AccountDeletionRequestSchema = new Schema({
  identifier: { type: String, required: true, trim: true },
  reason: { type: String, trim: true },
  status: { type: String, enum: ['pending', 'done'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IAccountDeletionRequest>('AccountDeletionRequest', AccountDeletionRequestSchema);
