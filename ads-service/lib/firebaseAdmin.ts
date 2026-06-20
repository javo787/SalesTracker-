import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

function getFirebaseAdmin() {
  if (!getApps().length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Firebase Admin environment variables are missing');
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      } as any),
    });
  }
  return getMessaging();
}

export async function sendPushToTopic(
  topic: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  const messaging = getFirebaseAdmin();
  await messaging.send({
    topic,
    notification: { title, body },
    data,
  });
}
