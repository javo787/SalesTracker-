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
