import mongoose, { Schema, Document } from 'mongoose';

export interface ICronRun extends Document {
  job: string;
  date: string; // 'YYYY-MM-DD'
  ranAt: Date;
}

const CronRunSchema = new Schema<ICronRun>({
  job:   { type: String, required: true },
  date:  { type: String, required: true },
  ranAt: { type: Date,   default: Date.now },
});

// Unique compound index — duplicate insert throws E11000
CronRunSchema.index({ job: 1, date: 1 }, { unique: true });

export default mongoose.model<ICronRun>('CronRun', CronRunSchema);
