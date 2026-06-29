import express from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import User from '../models/User';
import { runSalesReminderCheck } from '../services/salesReminderService';
import CronRun from '../models/CronRun';

const router = express.Router();

// Called by app on every open — saves FCM token
router.post('/register-token', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ message: 'fcmToken is required' });
    await User.findByIdAndUpdate(req.userId, {
      fcmToken,
      fcmTokenUpdatedAt: new Date(),
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ message: 'Error saving token' });
  }
});

// Called by app to toggle notifications
router.post('/toggle', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { enabled } = req.body;
    await User.findByIdAndUpdate(req.userId, { notificationsEnabled: enabled });
    res.json({ success: true });
  } catch {
    res.status(500).json({ message: 'Error updating preference' });
  }
});

// Called by cron-job.org at 20:00 Dushanbe time (15:00 UTC) Mon-Sat
// Protected by CRON_SECRET header
router.post('/run-reminder', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const todayStr = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

  try {
    // Attempt to claim today's run. Throws E11000 if already claimed.
    await CronRun.create({ job: 'sales-reminder', date: todayStr });
  } catch (err: any) {
    if (err.code === 11000) {
      // Already ran today — return 200 so cron-job.org does not retry again
      return res.json({ success: true, skipped: true, reason: 'already_ran_today' });
    }
    return res.status(500).json({ message: 'Failed to claim cron run', error: err.message });
  }

  try {
    const result = await runSalesReminderCheck();
    res.json({ success: true, ...result });
  } catch (err: any) {
    // Release the lock so a manual retry is possible later in the day
    await CronRun.deleteOne({ job: 'sales-reminder', date: todayStr }).catch(() => {});
    res.status(500).json({ message: 'Reminder check failed', error: err.message });
  }
});

export default router;
