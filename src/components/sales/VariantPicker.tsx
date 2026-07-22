import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AutocompleteResult } from '../../types/product';
import { Colors, Radius, Spacing, FontSize } from '../../constants/theme';
import { ColorCircle, getColorHex } from '../../constants/colors';

interface VariantPickerProps {
  candidates: AutocompleteResult[];
  onSelect: (product: AutocompleteResult) => void;
  /** Явный выход: ни один кандидат не подходит, это новый товар. Если не передан, чип не рендерится. */
  onMarkNew?: () => void;
  isDark?: boolean;
}

export function VariantPicker({ candidates, onSelect, onMarkNew, isDark }: VariantPickerProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      {candidates.map((c) => (
        <TouchableOpacity
          key={c.id ?? c.name}
          style={[styles.chip, isDark && styles.chipDark]}
          onPress={() => onSelect(c)}
        >
          {c.color ? (
            <ColorCircle hex={getColorHex(c.color) ?? '#BDBDBD'} size={12} />
          ) : null}
          <Text style={[styles.chipText, isDark && styles.chipTextDark]}>
            {c.color ? `${c.color}` : (c.article || c.name)}
          </Text>
        </TouchableOpacity>
      ))}
      {onMarkNew ? (
        <TouchableOpacity
          style={[styles.chip, styles.chipNew, isDark && styles.chipNewDark]}
          onPress={onMarkNew}
        >
          <Text style={[styles.chipText, styles.chipNewText]}>+ {t('products.newProduct')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: Radius.lg, backgroundColor: '#F0F0F0',
  },
  chipDark: { backgroundColor: '#3A3A3C' },
  chipText: { fontSize: FontSize.sm, color: '#333' },
  chipTextDark: { color: '#eee' },
  chipNew: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  chipNewDark: {
    backgroundColor: '#0D2A3D',
    borderColor: '#1565C0',
  },
  chipNewText: {
    color: '#2196F3',
    fontWeight: '600',
  },
});
