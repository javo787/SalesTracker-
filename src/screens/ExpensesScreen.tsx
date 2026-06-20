import React from 'react';
import { View, StyleSheet } from 'react-native';
import ExpensesView from '../components/expenses/ExpensesView';
import { useAppContext } from '../context/AppContext';

export default function ExpensesScreen() {
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#121212' : '#F5F5F5' }]}>
      <ExpensesView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
