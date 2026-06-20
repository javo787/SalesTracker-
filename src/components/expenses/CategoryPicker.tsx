import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ExpenseCategory } from '../../types/expense';
import { useAppContext } from '../../context/AppContext';

export const CATEGORY_CONFIG: Record<ExpenseCategory, { icon: string; translationKey: string }> = {
  inventory:  { icon: '📦', translationKey: 'inventory' },
  food:       { icon: '🍽️', translationKey: 'food' },
  utilities:  { icon: '💡', translationKey: 'utilities' },
  rent:       { icon: '🏪', translationKey: 'rent' },
  transport:  { icon: '🚚', translationKey: 'transport' },
  salary:     { icon: '👤', translationKey: 'salary' },
  equipment:  { icon: '🔧', translationKey: 'equipment' },
  other:      { icon: '📝', translationKey: 'other' },
};

interface CategoryPickerProps {
  selectedCategory: ExpenseCategory;
  onSelect: (category: ExpenseCategory) => void;
}

export default function CategoryPicker({ selectedCategory, onSelect }: CategoryPickerProps) {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container}>
      {(Object.keys(CATEGORY_CONFIG) as ExpenseCategory[]).map((cat) => (
        <TouchableOpacity
          key={cat}
          style={[
            styles.item,
            isDark ? styles.itemDark : styles.itemLight,
            selectedCategory === cat && styles.itemSelected
          ]}
          onPress={() => onSelect(cat)}
        >
          <Text style={styles.icon}>{CATEGORY_CONFIG[cat].icon}</Text>
          <Text style={[
            styles.label,
            isDark ? styles.labelDark : styles.labelLight,
            selectedCategory === cat && styles.labelSelected
          ]}>
            {t(`expenses.categories.${CATEGORY_CONFIG[cat].translationKey}`)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  item: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginRight: 10,
    width: 90,
    borderWidth: 1,
  },
  itemLight: {
    backgroundColor: '#fff',
    borderColor: '#eee',
  },
  itemDark: {
    backgroundColor: '#1E1E1E',
    borderColor: '#333',
  },
  itemSelected: {
    backgroundColor: '#1D9E75',
    borderColor: '#1D9E75',
  },
  icon: {
    fontSize: 24,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
  labelLight: {
    color: '#666',
  },
  labelDark: {
    color: '#aaa',
  },
  labelSelected: {
    color: '#fff',
  },
});
