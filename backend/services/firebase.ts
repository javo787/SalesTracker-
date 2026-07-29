import admin from 'firebase-admin';
import User from '../models/User';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    } as any),
  });
}

export const sendPushNotification = async (
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> => {
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: data || {},
      android: {
        priority: 'high',
        notification: { channelId: 'sales-reminder', sound: 'default' },
      },
    });
    return true;
  } catch (error: any) {
    if (error.code === 'messaging/registration-token-not-registered') {
      await User.findOneAndUpdate({ fcmToken }, { fcmToken: null });
    }
    return false;
  }
};

// Тихое data-only сообщение — без поля `notification`, значит ОС не показывает
// системный пуш пользователю. Используется, чтобы разбудить приложение на
// других устройствах магазина и попросить его подтянуть свежие данные сразу
// после того, как кто-то запушил изменения — вместо того, чтобы все открытые
// устройства раз в N секунд сами стучались на /sync/pull "на всякий случай".
// На Android доставляется надёжно (в т.ч. в фоне/после kill, headless JS-таск).
// На iOS доставка data-only сообщений — best-effort и может быть отложена ОС;
// там основной страховкой остаются pull() при выходе из фона и при onMessage
// в foreground.
export const sendSilentDataMessage = async (
  fcmToken: string,
  data: Record<string, string>
): Promise<boolean> => {
  try {
    await admin.messaging().send({
      token: fcmToken,
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { 'content-available': 1 } } },
    });
    return true;
  } catch (error: any) {
    if (error.code === 'messaging/registration-token-not-registered') {
      await User.findOneAndUpdate({ fcmToken }, { fcmToken: null });
    }
    return false;
  }
};
