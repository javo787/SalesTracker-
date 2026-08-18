import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AutocompleteResult } from '../../types/product';
import { Colors, Radius, Spacing, FontSize } from '../../constants/theme';
import { ColorCircle, getColorHex } from '../../constants/colors';
import { compareSizes } from '../../utils/productUtils';

interface VariantPickerProps {
  candidates: AutocompleteResult[];
  onSelect: (product: AutocompleteResult) => void;
  /** Явный выход: ни один кандидат не подходит, это новый товар. Если не передан, чип не рендерится. */
  onMarkNew?: () => void;
  isDark?: boolean;
}

export function VariantPicker({ candidates, onSelect, onMarkNew, isDark }: VariantPickerProps) {
  const { t } = useTranslation();
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const distinctColors = useMemo(() => {
    return Array.from(new Set(candidates.map(c => (c.color || '').trim()).filter(Boolean)));
  }, [candidates]);

  // If there are multiple colors and color hasn't been selected yet, show Color step
  const showColorStep = distinctColors.length > 1 && selectedColor === null;

  const handleColorSelect = (color: string) => {
    const colorCandidates = candidates.filter(c => (c.color || '').trim() === color);
    const distinctSizes = Array.from(new Set(colorCandidates.map(c => (c.size || '').trim()).filter(Boolean)));
    // If only 1 candidate or 0/1 size for this color, select immediately
    if (colorCandidates.length === 1 || distinctSizes.length <= 1) {
      onSelect(colorCandidates[0]);
    } else {
      setSelectedColor(color);
    }
  };

  const activeColor = selectedColor ?? (distinctColors.length === 1 ? distinctColors[0] : null);

  const filteredCandidates = useMemo(() => {
    let list = candidates;
    if (activeColor) {
      list = candidates.filter(c => (c.color || '').trim() === activeColor);
    }
    return [...list].sort((a, b) => compareSizes(a.size, b.size));
  }, [candidates, activeColor]);

  if (showColorStep) {
    return (
      <View style={styles.wrap}>
        {distinctColors.map((colorName) => {
          const hex = getColorHex(colorName);
          return (
            <TouchableOpacity
              key={`color-${colorName}`}
              style={[styles.chip, isDark && styles.chipDark]}
              onPress={() => handleColorSelect(colorName)}
            >
              {hex ? <ColorCircle hex={hex} size={12} /> : null}
              <Text style={[styles.chipText, isDark && styles.chipTextDark]}>
                {colorName}
              </Text>
            </TouchableOpacity>
          );
        })}
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

  return (
    <View>
      {distinctColors.length > 1 && selectedColor !== null && (
        <TouchableOpacity
          style={styles.backLink}
          onPress={() => setSelectedColor(null)}
        >
          <Text style={styles.backLinkText}>← {selectedColor}</Text>
        </TouchableOpacity>
      )}
      <View style={styles.wrap}>
        {filteredCandidates.map((c) => {
          const hasStock = (c.stock || 0) > 0;
          const chipLabel = c.size || c.color || c.article || c.name;
          const hex = c.color ? getColorHex(c.color) : null;

          return (
            <TouchableOpacity
              key={c.id ?? `${c.name}-${c.color}-${c.size}`}
              disabled={!hasStock}
              style={[
                styles.chip,
                isDark && styles.chipDark,
                !hasStock && styles.chipDisabled,
              ]}
              onPress={() => onSelect(c)}
            >
              {hex ? <ColorCircle hex={hex} size={12} /> : null}
              <Text
                style={[
                  styles.chipText,
                  isDark && styles.chipTextDark,
                  !hasStock && styles.chipTextDisabled,
                ]}
              >
                {chipLabel}
                {hasStock ? ` (${c.stock})` : ' (0)'}
              </Text>
            </TouchableOpacity>
          );
        })}
        {onMarkNew ? (
          <TouchableOpacity
            style={[styles.chip, styles.chipNew, isDark && styles.chipNewDark]}
            onPress={onMarkNew}
          >
            <Text style={[styles.chipText, styles.chipNewText]}>+ {t('products.newProduct')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
  chipDisabled: { opacity: 0.45, backgroundColor: '#EAEAEA' },
  chipTextDisabled: { color: '#999' },
  backLink: { marginTop: Spacing.xs, marginBottom: -2 },
  backLinkText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
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
