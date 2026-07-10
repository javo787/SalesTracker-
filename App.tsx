import 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef, useCallback } from 'react';

SplashScreen.preventAutoHideAsync().catch(() => {});
import { View, ActivityIndicator, TouchableOpacity, Platform, Text, AppState, Alert } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { NavigationContainer, DrawerActions, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { I18nextProvider, useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase, getOverdueDebts } from './src/db/database';
import { requestPermissions, showRemoteNotification, notifyOverdueDebts, registerFCMToken, setupPushHandlers } from './src/utils/notifications';
import { SyncService } from './src/services/syncService';
import i18n from './src/i18n/i18n';
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { adService } from './src/services/adService';
import { analyticsService } from './src/services/analyticsService';
import { AppContextProvider, useAppContext } from './src/context/AppContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ShopProvider, useShop } from './src/context/ShopContext';
import { AppLockProvider, useAppLock } from './src/context/AppLockContext';
import { useNewsUnread } from './src/hooks/useNewsUnread';
import { Ionicons } from '@expo/vector-icons';
import { FEATURES } from './src/config/features';
import { Colors, DarkTheme as DarkColors, LightTheme as LightColors, Radius, Shadow } from './src/constants/theme';

import HomeScreen from './src/screens/HomeScreen'; 
import AuthScreen from './src/screens/AuthScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AddSaleScreen from './src/screens/AddSaleScreen';
import ProductsScreen from './src/screens/ProductsScreen';
import ReportScreen from './src/screens/ReportScreen';
import CalculatorScreen from './src/screens/CalculatorScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ShopSetupScreen from './src/screens/ShopSetupScreen';
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
import ForgotLockScreen from './src/screens/ForgotLockScreen';
import DebtorsScreen from './src/screens/DebtorsScreen';
import SellersScreen from './src/screens/SellersScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import AppSplashScreen from './src/components/AppSplashScreen';
import CheckInSettingsScreen from './src/screens/CheckInSettingsScreen';
import CheckInScreen from './src/screens/CheckInScreen';

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
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: isDark ? DarkColors.textSecondary : LightColors.textSecondary,
        tabBarStyle: {
          backgroundColor: isDark ? DarkColors.tabBarBg : LightColors.tabBarBg,
          borderTopWidth: 0.5,
          borderTopColor: isDark ? DarkColors.tabBarBorder : LightColors.tabBarBorder,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          ...Shadow.sm,
        },
        headerStyle: { backgroundColor: isDark ? DarkColors.headerBg : LightColors.headerBg },
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

function NewsUnreadBadge({ color }: { color: string }) {
  const { hasUnread } = useNewsUnread();
  return (
    <View>
      <Ionicons name="newspaper-outline" size={22} color={color} />
      {hasUnread && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#FF6B6B',
          }}
        />
      )}
    </View>
  );
}

function DrawerNavigator() {
  const { t } = useTranslation();
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const { isOwner } = useShop();

  return (
    <Drawer.Navigator
      id="MainDrawer"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        drawerPosition: 'right',
        headerShown: false,
        drawerStyle: {
          width: '75%',
          backgroundColor: isDark ? DarkColors.card : LightColors.card,
        },
        drawerActiveTintColor: Colors.primary,
        drawerInactiveTintColor: isDark ? DarkColors.textSecondary : '#555',
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
      {isOwner && (
        <Drawer.Screen
          name="Expenses"
          component={ExpensesScreen}
          options={{
            drawerLabel: t('tabs.expenses'),
            drawerIcon: ({ color }) => <Ionicons name="receipt-outline" size={22} color={color} />,
          }}
        />
      )}
      <Drawer.Screen
        name="ReportsDrawer"
        component={ReportScreen}
        options={{
          drawerLabel: t('tabs.reports'),
          drawerIcon: ({ color }) => <Ionicons name="stats-chart-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="Calculator"
        component={CalculatorScreen}
        options={{
          drawerLabel: t('tabs.calculator'),
          drawerIcon: ({ color }) => <Ionicons name="calculator-outline" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="Currency"
        component={CurrencyScreen}
        options={{
          drawerLabel: t('tabs.currency'),
          drawerIcon: ({ color }) => <Ionicons name="cash-outline" size={22} color={color} />,
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
      {isOwner && (
        <Drawer.Screen
          name="Sellers"
          component={SellersScreen}
          options={{
            drawerLabel: t('sellers.teamTitle') || 'Команда',
            drawerIcon: ({ color }) => <Ionicons name="people-outline" size={22} color={color} />,
          }}
        />
      )}
      {isOwner && (
        <Drawer.Screen
          name="CheckInSettings"
          component={CheckInSettingsScreen}
          options={{
            drawerLabel: t('checkIn.title') || 'Проверка присутствия',
            drawerIcon: ({ color }) => <Ionicons name="checkbox-outline" size={22} color={color} />,
          }}
        />
      )}
      <Drawer.Screen
        name="Clients"
        component={DebtorsScreen}
        options={{
          drawerLabel: t('tabs.clients') || 'Клиенты',
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="people-outline" size={size || 22} color={color} />
          ),
          headerShown: false,
        }}
      />
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
          drawerIcon: ({ color }) => <NewsUnreadBadge color={color} />,
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

const enableImmersiveMode = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await NavigationBar.setVisibilityAsync('hidden');
    if ('setBehaviorAsync' in NavigationBar) {
      await (NavigationBar as any).setBehaviorAsync('overlay-swipe');
    }
    // overlay-swipe = Sticky Immersive:
    // свайп снизу временно показывает панель, она сама прячется обратно
  } catch (e) {
    console.warn('[ImmersiveMode] error:', e);
  }
};

function AppContent({ onReady }: { onReady: () => void }) {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isLockEnabled, isLocked, isLoading: isAppLockLoading } = useAppLock();
  const { t } = useTranslation();
  const navigationRef = useNavigationContainerRef();
  const routeNameRef = useRef<string>(undefined);

  const { currency } = useAppContext();
  const { hasShop, isLoading: isShopLoading, shopRevoked, setShopRevoked } = useShop();

  useEffect(() => {
    // Initialize auto sync (push/pull delta trigger listeners) at app startup
    SyncService.initAutoSync();
  }, []);

  useEffect(() => {
    if (shopRevoked) {
      Alert.alert(
        t('sellers.shopRevokedTitle') || 'Access Revoked',
        t('sellers.shopRevokedDesc') || 'You are no longer a member of this shop.',
        [{ text: 'OK', onPress: () => setShopRevoked(false) }]
      );
    }
  }, [shopRevoked]);

  useEffect(() => {
    if (isAuthenticated && hasShop) {
      registerFCMToken();
    }
  }, [isAuthenticated, hasShop]);

  useEffect(() => {
    if (isAuthenticated && hasShop && navigationRef.current) {
      setupPushHandlers(navigationRef.current);
    }
  }, [isAuthenticated, hasShop]);

  useEffect(() => {
    enableImmersiveMode();

    // Android при сворачивании/разворачивании сбрасывает режим —
    // восстанавливаем при каждом возврате в приложение
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        enableImmersiveMode();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    checkOnboarding();
  }, []);

  useEffect(() => {
    const checkOverdue = async () => {
      try {
        const overdue = getOverdueDebts() as any[];
        if (overdue.length > 0) {
          await notifyOverdueDebts(overdue, currency.symbol);
        }
      } catch (e) {
        console.warn('Failed to check overdue debts:', e);
      }
    };
    if (isAuthenticated) {
      checkOverdue();
    }
  }, [isAuthenticated, currency.symbol]);

  const checkOnboarding = async () => {
    try {
      const completed = await AsyncStorage.getItem('onboarding_completed');
      setShowOnboarding(completed !== 'true');
    } catch (e) {
      setShowOnboarding(false);
    }
  };

  const isInitializing = showOnboarding === null || isAuthLoading || isAppLockLoading || isShopLoading;

  useEffect(() => {
    if (!isInitializing) {
      onReady();
    }
  }, [isInitializing, onReady]);

  if (isInitializing) {
    return null;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  if (showOnboarding) {
    return <OnboardingScreen onFinish={() => setShowOnboarding(false)} />;
  }

  if (!hasShop) {
    return <ShopSetupScreen />;
  }

  if (isLockEnabled && isLocked) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Lock" component={LockScreen} />
          <Stack.Screen name="ForgotLock" component={ForgotLockScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
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
          options={{ title: 'Настройки', headerStyle: { backgroundColor: Colors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: t('profile.title'), headerStyle: { backgroundColor: Colors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="Expenses"
          component={ExpensesScreen}
          options={{ title: t('tabs.expenses'), headerStyle: { backgroundColor: Colors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="ClassifiedDetail"
          component={ClassifiedDetailScreen}
          options={{ title: t('classifieds.title'), headerStyle: { backgroundColor: Colors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="WholesaleDetail"
          component={WholesaleDetailScreen}
          options={{ title: t('wholesale.title'), headerStyle: { backgroundColor: Colors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="AppLockSetup"
          component={AppLockSetupScreen}
          options={{ title: t('appLock.title'), headerStyle: { backgroundColor: Colors.primary }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="ForgotLock"
          component={ForgotLockScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Debtors"
          component={DebtorsScreen}
          options={{
            title: 'Должники',
            headerStyle: { backgroundColor: Colors.primary },
            headerTintColor: '#fff',
          }}
        />
        <Stack.Screen
          name="CheckInSettings"
          component={CheckInSettingsScreen}
          options={{
            title: t('checkIn.title') || 'Проверка присутствия',
            headerStyle: { backgroundColor: Colors.primary },
            headerTintColor: '#fff',
          }}
        />
        <Stack.Screen
          name="CheckIn"
          component={CheckInScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Sellers"
          component={SellersScreen}
          options={{
            title: t('sellers.teamTitle') || 'Команда',
            headerStyle: { backgroundColor: Colors.primary },
            headerTintColor: '#fff',
          }}
        />
        <Stack.Screen
          name="Sale"
          component={AddSaleScreen}
          options={{
            title: t('addSale.title'),
            headerStyle: { backgroundColor: Colors.primary },
            headerTintColor: '#fff',
          }}
        />
        <Stack.Screen
          name="ProductDetail"
          component={ProductDetailScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);
  const [isAppContentReady, setIsAppContentReady] = useState(false);
  const [isAppSplashScreenHidden, setIsAppSplashScreenHidden] = useState(false);

  const handleAppContentReady = useCallback(() => {
    setIsAppContentReady(true);
  }, []);

  useEffect(() => {
    // Initialize database
    try {
      initDatabase();
      setIsDbReady(true);
    } catch (e) {
      console.error('Failed to initialize database:', e);
      setDbError(e instanceof Error ? e : new Error('Unknown database error'));
    }

    GoogleSignin.configure({
      webClientId: '265164441201-tqpvcafomc06ekphquf1dk198vrpblha.apps.googleusercontent.com',
    });

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
        remoteMessage.notification?.title ?? 'Torgo',
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

  const isAppReady = dbError ? true : (isDbReady && isAppContentReady);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <AppContextProvider>
          <AuthProvider>
            <ShopProvider>
              <AppLockProvider>
                <I18nextProvider i18n={i18n}>
                  {dbError ? (
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
                  ) : (
                    <AppContent onReady={handleAppContentReady} />
                  )}
                </I18nextProvider>
              </AppLockProvider>
            </ShopProvider>
          </AuthProvider>
        </AppContextProvider>

        {!isAppSplashScreenHidden && (
          <AppSplashScreen
            ready={isAppReady}
            onHidden={() => {
              setIsAppSplashScreenHidden(true);
              SplashScreen.hideAsync().catch(() => {});
            }}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}
