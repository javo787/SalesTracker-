import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import { NavigationContainer, DrawerActions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { I18nextProvider, useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase } from './src/db/database';
import { requestPermissions } from './src/utils/notifications';
import i18n from './src/i18n/i18n';
import { AppContextProvider, useAppContext } from './src/context/AppContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

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
import CustomDrawerContent from './src/components/CustomDrawerContent';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

function MainTabs() {
  const { t } = useTranslation();
  const { theme } = useAppContext();
  const isDark = theme === 'dark';

  return (
    <Tab.Navigator
      screenOptions={({ navigation }) => ({
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
        name="Главная"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tabs.home'),
          title: t('home.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Продажа"
        component={AddSaleScreen}
        options={{
          tabBarLabel: t('tabs.sale'),
          title: t('addSale.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Товары"
        component={ProductsScreen}
        options={{
          tabBarLabel: t('tabs.products'),
          title: t('products.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Калькулятор"
        component={CalculatorScreen}
        options={{
          tabBarLabel: 'Калькул.',
          title: 'Калькулятор',
          tabBarIcon: ({ color, size }) => <Ionicons name="calculator-outline" size={size} color={color} />,
        }}
      />

      <Tab.Screen
        name="Валюта"
        component={CurrencyScreen}
        options={{
          tabBarLabel: 'Валюта',
          title: 'Курсы валют',
          tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" size={size} color={color} />,
        }}
      />

      <Tab.Screen
        name="Отчёт"
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
  const { theme } = useAppContext();
  const isDark = theme === 'dark';

  return (
    <Drawer.Navigator
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
        name="Профиль"
        component={ProfileScreen}
        options={{
          drawerLabel: t('profile.title'),
          drawerIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} />,
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
      <Drawer.Screen
        name="Настройки"
        component={SettingsScreen}
        options={{
          drawerLabel: t('settings.title'),
          drawerIcon: ({ color }) => <Ionicons name="settings-outline" size={22} color={color} />,
        }}
      />
    </Drawer.Navigator>
  );
}

function AppContent() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

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

  if (showOnboarding === null || isAuthLoading) {
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

  const { t } = useTranslation();

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Main" component={DrawerNavigator} options={{ headerShown: false }} />
        {/* Keeping screens in stack for deeper navigation if needed, or if navigated from elsewhere */}
        <Stack.Screen
          name="Настройки"
          component={SettingsScreen}
          options={{ title: 'Настройки', headerStyle: { backgroundColor: '#1D9E75' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="Профиль"
          component={ProfileScreen}
          options={{ title: t('profile.title'), headerStyle: { backgroundColor: '#1D9E75' }, headerTintColor: '#fff' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    initDatabase();
    requestPermissions();
  }, []);

  return (
    <AppContextProvider>
      <AuthProvider>
        <I18nextProvider i18n={i18n}>
          <AppContent />
        </I18nextProvider>
      </AuthProvider>
    </AppContextProvider>
  );
}
