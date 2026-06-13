import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { initDatabase } from './src/db/database';

/* Local fallback ReportScreen component because the original module is missing */
const ReportScreen = () => {
  return <Text>Отчёты</Text>;
};

import ProductsScreen from './src/screens/ProductsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

/* Fallback HomeScreen component because the original module is missing */
const HomeScreen = () => {
  return <Text>Главная</Text>;
};

/* AddSaleScreen module not found; provide a local fallback component */
const AddSaleScreen = () => {
  return <Text>Добавить продажу</Text>;
};

const Tab = createBottomTabNavigator();

export default function App() {
  useEffect(() => {
    initDatabase();
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