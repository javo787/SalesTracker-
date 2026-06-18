import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { useProductAutocomplete } from '../../hooks/useProductAutocomplete';
import { AutocompleteResult } from '../../types/product';
import { HighlightedText } from './HighlightedText';

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSelect: (product: AutocompleteResult) => void;
  inputStyle?: any;
  containerStyle?: any;
  placeholder?: string;
  placeholderTextColor?: string;
}

export function ProductAutocomplete({
  value,
  onChange,
  onSelect,
  inputStyle,
  containerStyle,
  placeholder,
  placeholderTextColor,
}: Props) {
  const { t } = useTranslation();
  const { theme, currency } = useAppContext();
  const { results, search, getTopProducts } = useProductAutocomplete();
  const [isVisible, setIsVisible] = useState(false);
  const isDark = theme === 'dark';

  const handleInputChange = (text: string) => {
    onChange(text);
    search(text);
    setIsVisible(true);
  };

  const handleFocus = () => {
    if (!value) {
      getTopProducts();
    } else {
      search(value);
    }
    setIsVisible(true);
  };

  const handleSelect = (product: AutocompleteResult) => {
    onSelect(product);
    setIsVisible(false);
  };

  const catalogItems = results.filter((r) => r.source === 'catalog');
  const historyItems = results.filter((r) => r.source === 'history');

  const renderItem = (item: AutocompleteResult) => (
    <TouchableOpacity
      key={`${item.source}-${item.id || item.name}`}
      style={styles.item}
      onPress={() => handleSelect(item)}
    >
      <View style={styles.itemLeft}>
        <Text style={styles.icon}>{item.source === 'catalog' ? '📦' : '🕐'}</Text>
        <HighlightedText
          text={item.name}
          query={value}
          accentColor="#1D9E75"
          baseStyle={StyleSheet.flatten([styles.itemName, isDark ? styles.textDark : styles.textLight])}
        />
      </View>
      <Text style={styles.itemPrice}>
        {item.purchasePrice} {currency.symbol}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={handleInputChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
      />

      {isVisible && (results.length > 0 || (value.trim() && !results.some(r => r.name.toLowerCase() === value.trim().toLowerCase()))) && (
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
                {catalogItems.map(renderItem)}
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

            {value.trim() && !results.some(r => r.name.toLowerCase() === value.trim().toLowerCase()) && (
              <TouchableOpacity
                style={styles.item}
                onPress={() => handleSelect({
                  id: null,
                  name: value.trim(),
                  source: 'history',
                  purchasePrice: 0,
                  lastSalePrice: null,
                  salesCount: 0,
                  lastSoldAt: null
                })}
              >
                <Text style={[styles.addNew, { color: '#1D9E75' }]}>
                  ➕ {t('common.addNew')} "{value.trim()}"
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

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
