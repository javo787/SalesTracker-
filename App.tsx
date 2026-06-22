import 'react-native-gesture-handler';
import { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, TouchableOpacity, Platform, Text } from 'react-native';
import { NavigationContainer, DrawerActions, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { I18nextProvider, useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase } from './src/db/database';
import { requestPermissions, showRemoteNotification } from './src/utils/notifications';
import i18n from './src/i18n/i18n';
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { adService } from './src/services/adService';
import { analyticsService } from './src/services/analyticsService';
import { AppContextProvider, useAppContext } from './src/context/AppContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppLockProvider, useAppLock } from './src/context/AppLockContext';
import { useNewsUnread } from './src/hooks/useNewsUnread';
import { Ionicons } from '@expo/vector-icons';
import { FEATURES } from './src/config/features';

import HomeScreen from './src/screens/HomeScreen'; 
import AuthScreen from './src/screens/AuthScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AddSaleScreen from './src/screens/AddSaleScreen';
import ProductsScreen from './src/screens/ProductsScreen';
import ReportScreen from './src/screens/ReportScreen';
import CalculatorScreen from './src/screens/CalculatorScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import CurrencyScreen from './src/screens/CurrencyScreen';
import ExpensesScreen from './src/screens/ExpensesScreen';
import ClassifiedsScreen from './src/screens/ClassifiedsScreen';
import ClassifiedDetailScreen from './src/screens/ClassifiedDetailScreen';
import WholesaleScreen from './src/screens/WholesaleScreen';
import WholesaleDetailScreen from './src/screens/WholesaleDetailScreen';
import NewsScreen from './src/screens/NewsScreen';
import CustomDrawerContent from './src/components/CustomDrawerContent';
import LockScreen from './src/screens/LockScreen';
import AppLockSetupScreen from './src/screens/AppLockSetupScreen';
import DebtorsScreen from './src/screens/DebtorsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

function MainTabs() {
  const { t } = useTranslation();
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={({ navigation }) => ({
        tabBarActiveTintColor: '#1D9E75',
        tabBarInactiveTintColor: isDark ? '#aaa' : '#888',
        tabBarStyle: {
          backgroundColor: isDark ? '#121212' : '#fff',
          borderTopWidth: 0.5,
          borderTopColor: isDark ? '#333' : '#eee',
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
        headerStyle: { backgroundColor: '#1D9E75' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            style={{ marginRight: 16 }}
          >
            <Ionicons name="menu-outline" size={28} color="#fff" />
          </TouchableOpacity>
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tabs.home'),
          title: t('home.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Sale"
        component={AddSaleScreen}
        options={{
          tabBarLabel: t('tabs.sale'),
          title: t('addSale.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsScreen}
        options={{
          tabBarLabel: t('tabs.products'),
          title: t('products.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Calculator"
        component={CalculatorScreen}
        options={{
          tabBarLabel: 'Калькул.',
          title: 'Калькулятор',
          tabBarIcon: ({ color, size }) => <Ionicons name="calculator-outline" size={size} color={color} />,
        }}
      />

      <Tab.Screen
        name="Currency"
        component={CurrencyScreen}
        options={{
          tabBarLabel: 'Валюта',
          title: 'Курсы валют',
          tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" size={size} color={color} />,
        }}
      />

      <Tab.Screen
        name="Reports"
        component={ReportScreen}
        options={{
          tabBarLabel: t('tabs.reports'),
          title: t('reports.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
        }}
      />

    </Tab.Navigator>
  );
}

function DrawerNavigator() {
  const { t } = useTranslation();
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const { hasUnread } = useNewsUnread();

  return (
    <Drawer.Navigator
      id="MainDrawer"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        drawerPosition: 'right',
        headerShown: false,
        drawerStyle: {
          width: '75%',
          backgroundColor: isDark ? '#1E1E1E' : '#fff',
        },
        drawerActiveTintColor: '#1D9E75',
        drawerInactiveTintColor: isDark ? '#aaa' : '#555',
        drawerLabelStyle: {
          fontSize: 16,
          fontWeight: '500',
        },
      }}
    >
      <Drawer.Screen
        name="Tabs"
        component={MainTabs}
        options={{
          drawerLabel: t('tabs.home'),
          drawerIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          drawerLabel: t('profile.title'),
          drawerIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={{
          drawerLabel: t('tabs.expenses'),
          drawerIcon: ({ color }) => <Ionicons name="receipt-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="ReportsDrawer"
        component={ReportScreen}
        options={{
          drawerLabel: t('tabs.reports'),
          drawerIcon: ({ color }) => <Ionicons name="stats-chart-outline" size={22} color={color} />,
        }}
      />
      {FEATURES.CLASSIFIEDS_ENABLED && (
        <Drawer.Screen
          name="Classifieds"
          component={ClassifiedsScreen}
          options={{
            drawerLabel: t('classifieds.title'),
            drawerIcon: ({ color }) => <Ionicons name="storefront-outline" size={22} color={color} />,
          }}
        />
      )}
      {FEATURES.WHOLESALE_ENABLED && (
        <Drawer.Screen
          name="Wholesale"
          component={WholesaleScreen}
          options={{
            drawerLabel: t('wholesale.title'),
            drawerIcon: ({ color }) => <Ionicons name="cube-outline" size={22} color={color} />,
          }}
        />
      )}
      <Drawer.Screen
        name="News"
        component={NewsScreen}
        options={{
          drawerLabel: t('news.title'),
          drawerIcon: ({ color }) => (
            <View>
              <Ionicons name="newspaper-outline" size={22} color={color} />
              {hasUnread && <View style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B6B' }} />}
            </View>
          ),
        }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          drawerLabel: t('settings.title'),
          drawerIcon: ({ color }) => <Ionicons name="settings-outline" size={22} color={color} />,
        }}
      />
    </Drawer.Navigator>
  );
}

async function setupPushNotifications() {
  await messaging().requestPermission();
  await messaging().subscribeToTopic('app_announcements');
}

function AppContent() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isLockEnabled, isLocked, isLoading: isAppLockLoading } = useAppLock();
  const { t } = useTranslation();
  const navigationRef = useNavigationContainerRef();
  const routeNameRef = useRef<string>(undefined);

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

  if (showOnboarding === null || isAuthLoading || isAppLockLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  if (showOnboarding) {
    return <OnboardingScreen onFinish={() => setShowOnboarding(false)} />;
  }

  if (isLockEnabled && isLocked) {
    return <LockScreen />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        routeNameRef.current = (navigationRef as any).getCurrentRoute()?.name;
      }}
      onStateChange={async () => {
        const previousRouteName = routeNameRef.current;
        const currentRouteName = (navigationRef as any).getCurrentRoute()?.name;

        if (previousRouteName !== currentRouteName && currentRouteName) {
          await analyticsService.logScreenView(currentRouteName);
        }
        routeNameRef.current = currentRouteName;
      }}
    >
      <Stack.Navigator id="RootStack">
        <Stack.Screen name="Main" component={DrawerNavigator} options={{ headerShown: false }} />
        {/* Keeping screens in stack for deeper navigation if needed, or if navigated from elsewhere */}
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Настройки', headerStyle: { backgroundColor: '#1D9E75' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: t('profile.title'), headerStyle: { backgroundColor: '#1D9E75' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="Expenses"
          component={ExpensesScreen}
          options={{ title: t('tabs.expenses'), headerStyle: { backgroundColor: '#1D9E75' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="ClassifiedDetail"
          component={ClassifiedDetailScreen}
          options={{ title: t('classifieds.title'), headerStyle: { backgroundColor: '#1D9E75' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="WholesaleDetail"
          component={WholesaleDetailScreen}
          options={{ title: t('wholesale.title'), headerStyle: { backgroundColor: '#1D9E75' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="AppLockSetup"
          component={AppLockSetupScreen}
          options={{ title: t('appLock.title'), headerStyle: { backgroundColor: '#1D9E75' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="Debtors"
          component={DebtorsScreen}
          options={{
            title: 'Должники',
            headerStyle: { backgroundColor: '#1D9E75' },
            headerTintColor: '#fff',
          }}
        />
        <Stack.Screen
          name="Sale"
          component={AddSaleScreen}
          options={{
            title: t('addSale.title'),
            headerStyle: { backgroundColor: '#1D9E75' },
            headerTintColor: '#fff',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);

  useEffect(() => {
    // Initialize database
    try {
      initDatabase();
      setIsDbReady(true);
    } catch (e) {
      console.error('Failed to initialize database:', e);
      setDbError(e instanceof Error ? e : new Error('Unknown database error'));
    }

    // Parallelize async initialization
    Promise.all([
      requestPermissions(),
      adService.init(),
      setupPushNotifications()
    ]).catch(err => console.warn('Initialization error:', err));
  }, []);

  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      await showRemoteNotification(
        remoteMessage.notification?.title ?? 'SavdoApp',
        remoteMessage.notification?.body ?? '',
        remoteMessage.data
      );
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (typeof data?.url === 'string') {
        WebBrowser.openBrowserAsync(data.url);
      }
    });
    return () => subscription.remove();
  }, []);

  if (dbError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Ionicons name="alert-circle-outline" size={64} color="#FF6B6B" />
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 16, textAlign: 'center' }}>
          Ошибка базы данных
        </Text>
        <Text style={{ fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center' }}>
          Не удалось запустить приложение. Пожалуйста, попробуйте перезагрузить его.
        </Text>
        <Text style={{ fontSize: 12, color: '#999', marginTop: 16 }}>
          {dbError.message}
        </Text>
      </View>
    );
  }

  if (!isDbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  return (
    <AppContextProvider>
      <AuthProvider>
        <AppLockProvider>
          <I18nextProvider i18n={i18n}>
            <AppContent />
          </I18nextProvider>
        </AppLockProvider>
      </AuthProvider>
    </AppContextProvider>
  );
}
