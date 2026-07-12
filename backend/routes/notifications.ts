import express from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import User from '../models/User';
import { runSalesReminderCheck } from '../services/salesReminderService';
import { runNewsReminderCheck } from '../services/newsReminderService';
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

// Окно случайного времени: 05:00–08:00 UTC = 10:00–13:00 Душанбе, шаг 15 мин.
// cron-job.org дёргает этот эндпоинт каждые 15 минут внутри окна (13 попыток).
// На каждой попытке шанс "сработать сейчас" = 1 / (сколько попыток ещё
// осталось до конца окна) — это даёт равномерно случайное время срабатывания
// и гарантирует срабатывание на последней попытке, если раньше не выпало.
// Душанбе не переходит на летнее время (UTC+5 круглый год), поэтому окно
// в UTC фиксированное и пересчитывать по сезонам не нужно.
const NEWS_WINDOW_START_MIN = 5 * 60;      // 05:00 UTC
const NEWS_WINDOW_END_MIN = 8 * 60;        // 08:00 UTC
const NEWS_STEP_MIN = 15;
const NEWS_TOTAL_ATTEMPTS =
  (NEWS_WINDOW_END_MIN - NEWS_WINDOW_START_MIN) / NEWS_STEP_MIN + 1; // 13

// Called by cron-job.org every 15 min between 05:00–08:00 UTC
// Protected by CRON_SECRET header
router.post('/run-news-reminder', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const existing = await CronRun.findOne({ job: 'news-reminder', date: todayStr });
  if (existing) {
    return res.json({ success: true, skipped: true, reason: 'already_ran_today' });
  }

  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const attemptIndex = Math.round((nowMin - NEWS_WINDOW_START_MIN) / NEWS_STEP_MIN);
  const attemptsRemaining = Math.max(1, NEWS_TOTAL_ATTEMPTS - attemptIndex);
  const shouldFireNow = Math.random() < 1 / attemptsRemaining;

  if (!shouldFireNow) {
    return res.json({ success: true, skipped: true, reason: 'not_selected_yet', attemptsRemaining });
  }

  try {
    await CronRun.create({ job: 'news-reminder', date: todayStr });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.json({ success: true, skipped: true, reason: 'already_ran_today' });
    }
    return res.status(500).json({ message: 'Failed to claim cron run', error: err.message });
  }

  try {
    const result = await runNewsReminderCheck();
    res.json({ success: true, ...result });
  } catch (err: any) {
    await CronRun.deleteOne({ job: 'news-reminder', date: todayStr }).catch(() => {});
    res.status(500).json({ message: 'News reminder check failed', error: err.message });
  }
});

export default router;
