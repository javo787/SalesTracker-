import mongoose, { Schema, Document } from 'mongoose';

export interface ISupportTicket extends Document {
  chatId: number;
  username?: string;
  firstName?: string;
  lang: 'ru' | 'uz' | 'tg' | 'en';
  messages: Array<{
    from: 'user' | 'admin';
    text: string;
    timestamp: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    chatId: { type: Number, required: true, unique: true },
    username: { type: String },
    firstName: { type: String },
    lang: { type: String, enum: ['ru', 'uz', 'tg', 'en'], default: 'ru' },
    messages: [
      {
        from: { type: String, enum: ['user', 'admin'], required: true },
        text: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);
