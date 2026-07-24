import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import { api } from '../services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions() {
  if (Platform.OS === 'web') return;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

export async function notifyLowStock(productName: string, currentStock: number) {
  const enabled = await AsyncStorage.getItem('app_notifications_enabled');
  if (enabled === 'false') return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ Низкий остаток товара!',
      body: `Товар "${productName}" заканчивается. Осталось всего ${currentStock} шт.`,
      data: { productName, currentStock },
    },
    trigger: null, // немедленно
  });
}

export async function registerFCMToken(): Promise<void> {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) return;

    const fcmToken = await messaging().getToken();
    if (fcmToken) {
      await api.post('/notifications/register-token', { fcmToken });
    }

    messaging().onTokenRefresh(async (newToken) => {
      await api.post('/notifications/register-token', { fcmToken: newToken });
    });
  } catch (err) {
    console.warn('FCM registration failed:', err);
  }
}

export function setupPushHandlers(navigation: any): void {
  // App is open — show local notification
  messaging().onMessage(async (remoteMessage) => {
    const { title, body } = remoteMessage.notification || {};
    if (title && body) {
      await showRemoteNotification(title, body, remoteMessage.data);
    }
  });

  // App was closed — user tapped notification
  messaging().onNotificationOpenedApp((remoteMessage) => {
    const type = remoteMessage.data?.type;
    if (type === 'sales_reminder' || type === 'seller_inactive') {
      navigation.navigate('Sale');
    } else if (type === 'news') {
      navigation.navigate('News');
    }
  });
}

export async function scheduleDebtReminder(
  debtId: number,
  clientName: string,
  amount: number,
  dueDate: string, // 'YYYY-MM-DD'
  currencySymbol: string
): Promise<string | null> {
  const enabled = await AsyncStorage.getItem('app_notifications_enabled');
  if (enabled === 'false') return null;

  // Парсим 'YYYY-MM-DD' вручную, чтобы избежать проблем с часовыми поясами
  const [year, month, day] = dueDate.split('-').map(Number);
  const due = new Date(year, month - 1, day, 9, 0, 0);

  if (due <= new Date()) return null; // уже просрочен — не планируем

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: '💰 Срок долга сегодня',
      body: `${clientName} должен ${amount.toLocaleString()} ${currencySymbol}`,
      data: { type: 'debt', debtId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: due,
      channelId: 'default',
    },
  });

  return identifier;
}

export async function cancelDebtReminder(notificationId: string | null) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (_) {}
}

export async function notifyOverdueDebts(
  overdueDebts: Array<{ client_name: string; remaining: number }>,
  currencySymbol: string
) {
  const enabled = await AsyncStorage.getItem('app_notifications_enabled');
  if (enabled === 'false') return;
  if (overdueDebts.length === 0) return;

  const totalRemaining = overdueDebts.reduce((sum, d) => sum + d.remaining, 0);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `⚠️ ${overdueDebts.length} просроченных долгов`,
      body: `Итого: ${totalRemaining.toLocaleString()} ${currencySymbol}`,
      data: { type: 'overdue_debts' },
    },
    trigger: null, // сразу
  });
}

export async function showRemoteNotification(title: string, body: string, data?: any) {
  const enabled = await AsyncStorage.getItem('app_notifications_enabled');
  if (enabled === 'false') return;

  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null,
  });
}

export function getNotificationLanguage(lang: string | null | undefined): 'ru' | 'tg' | 'uz' {
  if (!lang) return 'ru';
  const cleanLang = lang.toLowerCase();
  if (cleanLang === 'tg') return 'tg';
  if (cleanLang === 'uz' || cleanLang === 'uz-cyrl') return 'uz';
  return 'ru';
}

export async function updateLanguageSubscription(newLang: string, oldLang?: string) {
  try {
    const newTopicLang = getNotificationLanguage(newLang);
    const newTopic = `app_announcements_${newTopicLang}`;

    if (oldLang) {
      const oldTopicLang = getNotificationLanguage(oldLang);
      const oldTopic = `app_announcements_${oldTopicLang}`;
      if (oldTopic !== newTopic) {
        console.log(`[Push] Unsubscribing from old topic: ${oldTopic}`);
        await messaging().unsubscribeFromTopic(oldTopic).catch(err => {
          console.warn(`[Push] Failed to unsubscribe from ${oldTopic}:`, err);
        });
      }
    } else {
      // Unsubscribe from other possible topics to ensure a clean state
      const possibleLangs: Array<'ru' | 'tg' | 'uz'> = ['ru', 'tg', 'uz'];
      for (const pl of possibleLangs) {
        if (pl !== newTopicLang) {
          const oldTopic = `app_announcements_${pl}`;
          await messaging().unsubscribeFromTopic(oldTopic).catch(() => {});
        }
      }
      // Also unsubscribe from the deprecated single 'app_announcements' topic
      await messaging().unsubscribeFromTopic('app_announcements').catch(() => {});
    }

    console.log(`[Push] Subscribing to topic: ${newTopic}`);
    await messaging().subscribeToTopic(newTopic);
  } catch (err) {
    console.warn('[Push] Failed to update language subscription:', err);
  }
}