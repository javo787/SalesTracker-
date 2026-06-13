import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { I18nextProvider, useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase } from './src/db/database';
import { requestPermissions } from './src/utils/notifications';
import i18n from './src/i18n/i18n';
import { AppContextProvider, useAppContext } from './src/context/AppContext';

import HomeScreen from './src/screens/HomeScreen';
import AddSaleScreen from './src/screens/AddSaleScreen';
import ProductsScreen from './src/screens/ProductsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ReportScreen from './src/screens/ReportScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';

const Tab = createBottomTabNavigator();

function MainNavigator() {
  const { t } = useTranslation();
  const { theme } = useAppContext();

  const isDark = theme === 'dark';

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#1D9E75',
          tabBarInactiveTintColor: isDark ? '#aaa' : '#888',
          tabBarStyle: {
            backgroundColor: isDark ? '#121212' : '#fff',
            borderTopWidth: 0.5,
            borderTopColor: isDark ? '#333' : '#eee',
            height: 60,
            paddingBottom: 8,
          },
          headerStyle: { backgroundColor: '#1D9E75' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Tab.Screen
          name="Главная"
          component={HomeScreen}
          options={{
            tabBarLabel: t('tabs.home'),
            title: t('home.title')
          }}
        />
        <Tab.Screen
          name="Продажа"
          component={AddSaleScreen}
          options={{
            tabBarLabel: t('tabs.sale'),
            title: t('addSale.title')
          }}
        />
        <Tab.Screen
          name="Товары"
          component={ProductsScreen}
          options={{
            tabBarLabel: t('tabs.products'),
            title: t('products.title')
          }}
        />
        <Tab.Screen
          name="Отчёт"
          component={ReportScreen}
          options={{
            tabBarLabel: t('tabs.reports'),
            title: t('reports.title')
          }}
        />
        <Tab.Screen
          name="Настройки"
          component={SettingsScreen}
          options={{
            tabBarLabel: t('tabs.settings'),
            title: t('settings.title')
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function AppContent() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const completed = await AsyncStorage.getItem('onboarding_completed');
      setShowOnboarding(completed !== 'true');
    } catch (e) {
      setShowOnboarding(false);
    }
  };

  if (showOnboarding === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  if (showOnboarding) {
    return <OnboardingScreen onFinish={() => setShowOnboarding(false)} />;
  }

  return <MainNavigator />;
}

export default function App() {
  useEffect(() => {
    initDatabase();
    requestPermissions();
  }, []);

  return (
    <AppContextProvider>
      <I18nextProvider i18n={i18n}>
        <AppContent />
      </I18nextProvider>
    </AppContextProvider>
  );
}
