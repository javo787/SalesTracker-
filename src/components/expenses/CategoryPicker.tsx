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
  isDark?: boolean;
}

export default function CategoryPicker({ selectedCategory, onSelect, isDark: propIsDark }: CategoryPickerProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useAppContext();
  const isDark = propIsDark !== undefined ? propIsDark : resolvedTheme === "dark";

  return (
    <View>
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
      <View
        style={[
          styles.scrollFadeRight,
          { backgroundColor: isDark ? 'rgba(18,18,18,0.8)' : 'rgba(255,255,255,0.8)' }
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  item: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    marginRight: 8,
    width: 64,
    borderWidth: 1,
  },
  itemLight: {
    backgroundColor: '#fff',
    borderColor: '#eee',
  },
  itemDark: {
    backgroundColor: '#2A2A2A',
    borderColor: '#444',
  },
  itemSelected: {
    backgroundColor: '#1D9E75',
    borderColor: '#1D9E75',
  },
  icon: {
    fontSize: 16,
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  labelLight: {
    color: '#666',
  },
  labelDark: {
    color: '#DDD',
  },
  labelSelected: {
    color: '#fff',
  },
  scrollFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
  },
});
