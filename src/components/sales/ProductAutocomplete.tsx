import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { useShop } from '../../context/ShopContext';
import { useAutocomplete } from '../../hooks/useAutocomplete';
import { AutocompleteResult } from '../../types/product';
import { searchProductsForAutocomplete } from '../../db/database';
import { HighlightedText } from './HighlightedText';
import { ColorCircle, getColorHex } from '../../constants/colors';
import { compareSizes } from '../../utils/productUtils';

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSelect: (product: AutocompleteResult) => void;
  inputStyle?: any;
  containerStyle?: any;
  placeholder?: string;
  placeholderTextColor?: string;
  returnKeyType?: TextInput['props']['returnKeyType'];
  onSubmitEditing?: () => void;
  onInputFocus?: () => void;
}

export const ProductAutocomplete = React.forwardRef<any, Props>(({
  value,
  onChange,
  onSelect,
  inputStyle,
  containerStyle,
  placeholder,
  placeholderTextColor,
  returnKeyType,
  onSubmitEditing,
  onInputFocus,
}, ref) => {
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const { t } = useTranslation();
  const { isOwner } = useShop();

  const fetchFn = async (q: string) => await searchProductsForAutocomplete(q) as AutocompleteResult[];
  const fetchTop = async () => await searchProductsForAutocomplete('') as AutocompleteResult[];
  const { results, isOpen, search, onFocus, onBlur, select } =
    useAutocomplete<AutocompleteResult>(fetchFn, fetchTop, 200);

  const handleInputChange = (text: string) => { onChange(text); search(text); };
  const handleSelect = (product: AutocompleteResult) => { select(product, onSelect); Keyboard.dismiss(); };

  const catalogItems = results.filter((r) => r.source === 'catalog');
  const historyItems = results.filter((r) => r.source === 'history');

  const groupedCatalog = React.useMemo(() => {
    const groups = new Map<string, AutocompleteResult[]>();
    const singles: AutocompleteResult[] = [];

    catalogItems.forEach(item => {
      if (item.article) {
        if (!groups.has(item.article)) groups.set(item.article, []);
        groups.get(item.article)!.push(item);
      } else {
        singles.push(item);
      }
    });

    const items: ({ type: 'group'; article: string; variants: AutocompleteResult[] } | { type: 'single'; item: AutocompleteResult })[] = [];

    groups.forEach((variants, article) => {
      if (variants.length > 1) {
        items.push({ type: 'group', article, variants });
      } else {
        singles.push(variants[0]);
      }
    });

    singles.forEach(item => items.push({ type: 'single', item }));

    // Keep relative order as much as possible, or sort
    return items;
  }, [catalogItems]);

  const renderItem = (item: AutocompleteResult) => {
    const colorHex = item.color ? getColorHex(item.color) : null;
    return (
      <TouchableOpacity
        key={`${item.source}-${item.id || item.name}`}
        style={styles.item}
        onPress={() => handleSelect(item)}
      >
        <View style={styles.itemLeft}>
          {colorHex && (
            <ColorCircle size={14} hex={colorHex} style={{ marginRight: 6 }} />
          )}
          <HighlightedText
            text={item.name}
            query={value}
            accentColor="#1D9E75"
            baseStyle={StyleSheet.flatten([styles.itemName, isDark ? styles.textDark : styles.textLight])}
          />
        </View>
        {isOwner && (
          <Text style={styles.itemPrice}>
            {item.purchasePrice} {currency.symbol}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        ref={ref}
        style={inputStyle}
        value={value}
        onChangeText={handleInputChange}
        onFocus={() => {
          onFocus(value);
          onInputFocus?.();
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={false}
      />

      {isOpen && results.length > 0 && (
        <View
          style={[
            styles.dropdown,
            isDark ? styles.dropdownDark : styles.dropdownLight,
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 280 }}
          >
            {catalogItems.length > 0 && (
              <>
                <View style={styles.divider}>
                  <Text style={styles.dividerText}>────── {t('common.fromCatalog')} ──────</Text>
                </View>
                {groupedCatalog.map((g) => {
                  if (g.type === 'single') return renderItem(g.item);
                  return (
                    <AutocompleteGroupItem
                      key={`group-${g.article}`}
                      article={g.article}
                      variants={g.variants}
                      isDark={isDark}
                      onSelect={handleSelect}
                    />
                  );
                })}
              </>
            )}

            {historyItems.length > 0 && (
              <>
                <View style={styles.divider}>
                  <Text style={styles.dividerText}>────── {t('common.fromHistory')} ──────</Text>
                </View>
                {historyItems.map(renderItem)}
              </>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
});

interface AutocompleteGroupItemProps {
  article: string;
  variants: AutocompleteResult[];
  isDark: boolean;
  onSelect: (variant: AutocompleteResult) => void;
}

const AutocompleteGroupItem: React.FC<AutocompleteGroupItemProps> = ({
  article,
  variants,
  isDark,
  onSelect,
}) => {
  const distinctSizes = React.useMemo(() => {
    return Array.from(new Set(variants.map(v => (v.size || '').trim()).filter(Boolean)));
  }, [variants]);

  const distinctColors = React.useMemo(() => {
    const list = Array.from(new Set(variants.map(v => (v.color || '').trim()).filter(Boolean)));
    if (list.length === 0) list.push('');
    return list;
  }, [variants]);

  const defaultColor = React.useMemo(() => {
    const stockByColor: Record<string, number> = {};
    variants.forEach(v => {
      const c = (v.color || '').trim();
      stockByColor[c] = (stockByColor[c] || 0) + (v.stock || 0);
    });
    if (distinctColors.length === 0) return '';
    return distinctColors.reduce((best, c) => (stockByColor[c] > (stockByColor[best] || 0) ? c : best), distinctColors[0]);
  }, [variants, distinctColors]);

  const [selectedColor, setSelectedColor] = React.useState<string>(defaultColor);

  if (distinctSizes.length <= 1) {
    return (
      <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEE', paddingVertical: 8 }}>
        <View style={[styles.item, { borderBottomWidth: 0, paddingBottom: 4 }]}>
          <View style={styles.itemLeft}>
            <Text style={[styles.itemName, isDark ? styles.textDark : styles.textLight, { fontWeight: 'bold' }]}>
              {variants[0].baseName ?? variants[0].name}
            </Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        >
          {variants.map((v) => (
            <TouchableOpacity
              key={v.id || `${v.name}-${v.color}-${v.size}`}
              onPress={() => onSelect(v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 20,
                backgroundColor: isDark ? '#2C2C2C' : '#F0F0F0',
                borderWidth: 1,
                borderColor: isDark ? '#444' : '#E0E0E0',
              }}
            >
              {v.color ? (
                <ColorCircle
                  size={12}
                  hex={getColorHex(v.color ?? '') ?? '#BDBDBD'}
                />
              ) : null}
              <Text style={[isDark ? styles.textDark : styles.textLight, { fontSize: 12 }]}>
                {(v.color || v.size || v.name).length > 12
                  ? (v.color || v.size || v.name).slice(0, 12) + '…'
                  : (v.color || v.size || v.name)}
                {v.stock && v.stock > 0 ? ` (${v.stock})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  const colorVariants = variants
    .filter(v => (v.color || '').trim() === selectedColor)
    .sort((a, b) => compareSizes(a.size, b.size));

  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEE', paddingVertical: 8 }}>
      <View style={[styles.item, { borderBottomWidth: 0, paddingBottom: 4 }]}>
        <View style={styles.itemLeft}>
          <Text style={[styles.itemName, isDark ? styles.textDark : styles.textLight, { fontWeight: 'bold' }]}>
            {variants[0].baseName ?? variants[0].name}
          </Text>
        </View>
      </View>

      {/* Row 1: Colors */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, marginBottom: 6 }}
      >
        {distinctColors.map((c) => {
          const isSelected = c === selectedColor;
          const hex = c ? getColorHex(c) : null;
          return (
            <TouchableOpacity
              key={`color-${c || 'none'}`}
              onPress={() => setSelectedColor(c)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 16,
                backgroundColor: isSelected
                  ? (isDark ? '#1D9E75' : '#E6F4EA')
                  : (isDark ? '#2C2C2C' : '#F0F0F0'),
                borderWidth: isSelected ? 1.5 : 1,
                borderColor: isSelected
                  ? '#1D9E75'
                  : (isDark ? '#444' : '#E0E0E0'),
              }}
            >
              {hex ? <ColorCircle size={12} hex={hex} /> : null}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: isSelected ? '600' : 'normal',
                  color: isSelected
                    ? (isDark ? '#FFF' : '#1D9E75')
                    : (isDark ? '#EEE' : '#333'),
                }}
              >
                {c || 'Базовый'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Row 2: Sizes for selected color */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        {colorVariants.map((v) => {
          const hasStock = (v.stock || 0) > 0;
          return (
            <TouchableOpacity
              key={v.id || `${v.name}-${v.size}`}
              disabled={!hasStock}
              onPress={() => onSelect(v)}
              style={{
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 16,
                backgroundColor: !hasStock
                  ? (isDark ? '#1F1F1F' : '#F5F5F5')
                  : (isDark ? '#3A3A3C' : '#FFFFFF'),
                borderWidth: 1,
                borderColor: !hasStock
                  ? (isDark ? '#333' : '#E0E0E0')
                  : (isDark ? '#555' : '#BDBDBD'),
                opacity: hasStock ? 1 : 0.45,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: !hasStock
                    ? (isDark ? '#777' : '#999')
                    : (isDark ? '#EEE' : '#333'),
                  fontWeight: hasStock ? '500' : 'normal',
                }}
              >
                {v.size || 'Стандарт'}
                {hasStock ? ` (${v.stock})` : ' (0)'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    zIndex: 999,
    position: 'relative',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderRadius: 8,
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
    zIndex: 1000,
  },
  dropdownLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dropdownDark: {
    backgroundColor: '#2C2C2C',
    borderWidth: 1,
    borderColor: '#444',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  itemName: {
    fontSize: 15,
  },
  itemPrice: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  textLight: {
    color: '#333',
  },
  textDark: {
    color: '#EEE',
  },
  divider: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  dividerText: {
    fontSize: 10,
    color: '#999',
    textTransform: 'uppercase',
  },
  addNew: {
    fontSize: 14,
    fontWeight: '600',
  },
});
