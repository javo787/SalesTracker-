import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function notifyImportantNews(titleRu: string, articleUrl: string) {
  const enabled = await AsyncStorage.getItem('app_notifications_enabled');
  if (enabled === 'false') return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📰 Важная новость',
      body: titleRu,
      data: { url: articleUrl, type: 'news' },
    },
    trigger: null,
  });
}