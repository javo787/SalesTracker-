import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { initDatabase } from './src/db/database';
import { requestPermissions } from './src/utils/notifications';

import HomeScreen from './src/screens/HomeScreen';
import AddSaleScreen from './src/screens/AddSaleScreen';
import ProductsScreen from './src/screens/ProductsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ReportScreen from './src/screens/ReportScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  useEffect(() => {
    initDatabase();
    requestPermissions();
  }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#1D9E75',
          tabBarInactiveTintColor: '#888',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 0.5,
            borderTopColor: '#eee',
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
          options={{ tabBarLabel: 'Главная', title: 'Savdo — Учёт' }}
        />
        <Tab.Screen
          name="Продажа"
          component={AddSaleScreen}
          options={{ tabBarLabel: '+ Продажа', title: 'Добавить продажу' }}
        />
        <Tab.Screen
          name="Товары"
          component={ProductsScreen}
          options={{ tabBarLabel: 'Товары', title: 'Мои товары' }}
        />
        <Tab.Screen
          name="Настройки"
          component={SettingsScreen}
          options={{ tabBarLabel: 'Настройки', title: 'Настройки' }}
        />
        <Tab.Screen
          name="Отчёт"
          component={ReportScreen}
          options={{ tabBarLabel: 'Отчёт', title: 'Отчёты' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}