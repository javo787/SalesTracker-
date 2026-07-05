import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ALL_CURRENCIES, CurrencyDef } from '../../constants/currencies';

interface CurrencyStepSelectorProps {
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

export default function CurrencyStepSelector({ selectedCode, onSelect }: CurrencyStepSelectorProps) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [gridWidth, setGridWidth] = useState(0);

  const CARD_GAP = 12;
  const cardWidth = gridWidth > 0 ? (gridWidth - CARD_GAP) / 2 : undefined;

  const filteredCurrencies = ALL_CURRENCIES.filter(curr => {
    const query = search.toLowerCase();
    return (
      curr.code.toLowerCase().includes(query) ||
      curr.label.toLowerCase().includes(query) ||
      curr.country.toLowerCase().includes(query)
    );
  });

  const priorityCurrencies = filteredCurrencies.filter(c => c.priority);
  const otherCurrencies = filteredCurrencies.filter(c => !c.priority);

  const isRussian = i18n.language.startsWith('ru');

  const renderCurrencyName = (curr: CurrencyDef) => {
    if (isRussian) {
      return `${curr.label} (${curr.country})`;
    }
    return `${curr.code} · ${curr.symbol}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('onboarding.currencySearchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#999"
        />
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {priorityCurrencies.length > 0 && (
          <View style={styles.grid} onLayout={(e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width)}>
            {priorityCurrencies.map(curr => (
              <TouchableOpacity
                key={curr.code}
                style={[
                  styles.priorityCard,
                  cardWidth ? { width: cardWidth } : null,
                  selectedCode === curr.code && styles.priorityCardActive
                ]}
                onPress={() => onSelect(curr.code)}
              >
                <Text style={styles.prioritySymbol}>{curr.symbol}</Text>
                <Text style={styles.priorityCode}>{curr.code}</Text>
                {isRussian && (
                  <Text style={styles.priorityLabel} numberOfLines={1}>
                    {curr.label}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.listContainer}>
          {otherCurrencies.map(curr => (
            <TouchableOpacity
              key={curr.code}
              style={[
                styles.listItem,
                selectedCode === curr.code && styles.listItemActive
              ]}
              onPress={() => onSelect(curr.code)}
            >
              <Text style={styles.listText}>{renderCurrencyName(curr)}</Text>
              {selectedCode === curr.code && (
                <Ionicons name="checkmark-circle" size={20} color="#1D9E75" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    marginBottom: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 46,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#333',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  priorityCard: {
    width: '48%', // fallback до первого onLayout-измерения; далее перекрывается точной пиксельной шириной
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#EEE',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  priorityCardActive: {
    borderColor: '#1D9E75',
    backgroundColor: '#F0FBF7',
  },
  prioritySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D9E75',
    marginBottom: 4,
  },
  priorityCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  priorityLabel: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  listContainer: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEE',
    overflow: 'hidden',
    marginBottom: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  listItemActive: {
    backgroundColor: '#F9F9F9',
  },
  listText: {
    fontSize: 15,
    color: '#444',
  },
});
