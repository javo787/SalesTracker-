import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AutocompleteResult } from '../../types/product';
import { Colors, Radius, Spacing, FontSize } from '../../constants/theme';
import { ColorCircle, getColorHex } from '../../constants/colors';

interface VariantPickerProps {
  candidates: AutocompleteResult[];
  onSelect: (product: AutocompleteResult) => void;
  isDark?: boolean;
}

export function VariantPicker({ candidates, onSelect, isDark }: VariantPickerProps) {
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
});
