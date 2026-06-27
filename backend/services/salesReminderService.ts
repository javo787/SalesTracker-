import mongoose from 'mongoose';
import Shop from '../models/Shop';
import ShopMember from '../models/ShopMember';
import Sale from '../models/Sale';
import User from '../models/User';
import { sendPushNotification } from './firebase';

const ACTIVITY_WINDOW_DAYS = 14;
const ACTIVE_THRESHOLD_DAYS = 4;

async function getActivityDays(
  shopId: mongoose.Types.ObjectId,
  sellerId: mongoose.Types.ObjectId
): Promise<number> {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - ACTIVITY_WINDOW_DAYS);
  const fromStr = fromDate.toISOString().split('T')[0];

  const result = await Sale.aggregate([
    { $match: { shopId, sellerId, created_at: { $gte: fromStr } } },
    { $group: { _id: { $substr: ['$created_at', 0, 10] } } },
    { $count: 'activeDays' },
  ]);

  return result[0]?.activeDays || 0;
}

export async function runSalesReminderCheck(): Promise<{ notified: number; skipped: number }> {
  const now = new Date();
  // Skip Sunday (0)
  if (now.getDay() === 0) return { notified: 0, skipped: 0 };

  const todayStr = now.toISOString().split('T')[0];
  let notified = 0;
  let skipped = 0;

  const shops = await Shop.find({ isActive: true }).lean();

  for (const shop of shops) {
    const shopId = shop._id as mongoose.Types.ObjectId;
    const members = await ShopMember.find({ shopId, isActive: true }).lean();
    const inactiveSellers: string[] = [];

    // Find owner's FCM token for summary notification
    const ownerMember = members.find(m => m.role === 'owner');
    const ownerUser = ownerMember
      ? await User.findById(ownerMember.userId).lean()
      : null;

    for (const member of members) {
      const userId = member.userId as mongoose.Types.ObjectId;

      // Check if member joined less than 3 days ago
      const joinedDaysAgo = Math.floor(
        (now.getTime() - new Date(member.joinedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (joinedDaysAgo < 3) { skipped++; continue; }

      // Check activity over last 14 days
      const activityDays = await getActivityDays(shopId, userId);
      if (activityDays < ACTIVE_THRESHOLD_DAYS) { skipped++; continue; }

      // Check today's sales
      const todaySales = await Sale.countDocuments({
        shopId,
        sellerId: userId,
        created_at: { $regex: `^${todayStr}` },
      });
      if (todaySales > 0) { skipped++; continue; }

      // Get user with FCM token
      const user = await User.findById(userId).lean();
      if (!user?.fcmToken || !user.notificationsEnabled) { skipped++; continue; }

      // Notify the member personally
      const sent = await sendPushNotification(
        user.fcmToken,
        '📊 Не забудь внести продажи!',
        `Привет, ${member.displayName}! Сегодня ещё нет записей о продажах.`,
        { type: 'sales_reminder', shopId: shopId.toString() }
      );

      if (sent) {
        notified++;
        if (member.role === 'seller') {
          inactiveSellers.push(member.displayName);
        }
      }
    }

    // Notify owner about inactive sellers (only if owner didn't personally sell)
    if (
      inactiveSellers.length > 0 &&
      ownerUser?.fcmToken &&
      ownerUser.notificationsEnabled
    ) {
      const msg =
        inactiveSellers.length === 1
          ? `Продавец ${inactiveSellers[0]} не вносил продажи сегодня`
          : `Без продаж сегодня: ${inactiveSellers.join(', ')}`;

      await sendPushNotification(
        ownerUser.fcmToken,
        '⚠️ Продажи не внесены',
        msg,
        { type: 'seller_inactive', shopId: shopId.toString() }
      );
    }
  }

  return { notified, skipped };
}
