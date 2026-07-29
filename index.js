import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import { SyncService } from './src/services/syncService';
import App from './App';

// Register background handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  if (remoteMessage.data?.type === 'shop_sync') {
    // Тихая инвалидация: кто-то в магазине запушил изменения, подтягиваем их,
    // не показывая пользователю уведомление.
    try {
      await SyncService.pull();
    } catch (err) {
      console.log('shop_sync background pull failed:', err);
    }
    return;
  }
  console.log('Push получен в фоне:', remoteMessage);
});

registerRootComponent(App);
