import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import App from './App';

// Register background handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Push получен в фоне:', remoteMessage);
});

registerRootComponent(App);
