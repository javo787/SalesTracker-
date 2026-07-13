module.exports = ({ config }) => ({
  expo: {
    name: "Torgo",
    slug: "torgo-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    platforms: [
      "android"
    ],
    scheme: "torgo",
    android: {
      package: "com.torgo.app",
      googleServicesFile: "./google-services.json",
      permissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.USE_BIOMETRIC",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "android.permission.USE_FINGERPRINT"
      ],
      softwareKeyboardLayoutMode: "pan",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon-fg.png",
        backgroundColor: "#1D9E75"
      },
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID
        }
      }
    },
    updates: {
      url: "https://u.expo.dev/9a8cb8e4-5c8c-4147-942b-46ea4c65fb4a"
    },
    runtimeVersion: "1.0.0",
    plugins: [
      [
        "expo-audio",
        {
          "microphonePermission": "Разрешите доступ к микрофону для использования голосового ввода",
          "recordAudioAndroid": true
        }
      ],
      "expo-sharing",
      "react-native-nfc-manager",
      [
        "expo-image-picker",
        {
          "photosPermission": "Разрешите доступ к фото для прикрепления изображений товаров"
        }
      ],
      "expo-font",
      "expo-asset",
      [
        "expo-local-authentication",
        {
          "faceIDPermission": "Используйте Face ID для быстрой и безопасной разблокировки Torgo"
        }
      ],
      [
        "@react-native-google-signin/google-signin",
        {
          "androidClientId": "265164441201-u27ifvp09fl36976hauoh9qv8jeulsv5.apps.googleusercontent.com",
          "iosUrlScheme": "com.googleusercontent.apps.265164441201-tqpvcafomc06ekphquf1dk198vrpblha",
          "webClientId": "265164441201-tqpvcafomc06ekphquf1dk198vrpblha.apps.googleusercontent.com"
        }
      ],
      "@benfurkankilic/expo-yandex-mobile-ads",
      "@react-native-firebase/app",
      "@react-native-firebase/analytics",
      "@react-native-firebase/messaging",
      [
        "expo-build-properties",
        {
          "android": {
            "enableProguardInReleaseBuilds": true,
            "enableShrinkResourcesInReleaseBuilds": true,
            "enableMinifyInReleaseBuilds": true
          }
        }
      ]
    ],
    ios: {
      bundleIdentifier: "com.torgo.app",
      googleServicesFile: "./GoogleService-Info.plist",
      infoPlist: {
        "NSSpeechRecognitionUsageDescription": "Allow $(PRODUCT_NAME) to use speech recognition.",
        "NSMicrophoneUsageDescription": "Allow $(PRODUCT_NAME) to use the microphone.",
        "LSApplicationQueriesSchemes": ["tg"]
      }
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
      pwa: {
        enabled: true,
        display: "standalone",
        orientation: "portrait",
        themeColor: "#1D9E75",
        backgroundColor: "#1D9E75",
        name: "Torgo",
        shortName: "Torgo",
        description: "Умный помощник для торговли",
        lang: "ru"
      }
    },
    owner: "javohirbeks-project",
    extra: {
      eas: {
        projectId: "9a8cb8e4-5c8c-4147-942b-46ea4c65fb4a"
      }
    }
  }
});
