import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { useWholesale } from '../hooks/useWholesale';
import WholesaleCard from '../components/market/WholesaleCard';
import UniversalBanner from '../components/ads/UniversalBanner';

const CATEGORIES = [
  'all',
  'clothing',
  'shoes',
  'accessories',
  'food',
  'electronics',
  'other',
];

export default function WholesaleScreen() {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const navigation = useNavigation<any>();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [debouncedCategory, setDebouncedCategory] = useState('all');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedCategory(selectedCategory);
    }, 300);
    return () => clearTimeout(handler);
  }, [selectedCategory]);

  const { ads, loading, refreshing, refresh } = useWholesale(
    debouncedCategory === 'all' ? undefined : debouncedCategory
  );

  const renderItem = useCallback(({ item }: any) => (
    <WholesaleCard
      item={item}
      onPress={(id) => navigation.navigate('WholesaleDetail', { id })}
    />
  ), []);

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={[styles.headerTitle, isDark ? styles.textWhite : styles.textBlack]}>
        {t('wholesale.partners')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.filterChip,
              selectedCategory === cat ? styles.filterChipActive : (isDark ? styles.chipDark : styles.chipLight)
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[
              styles.filterChipText,
              selectedCategory === cat ? styles.textWhite : (isDark ? styles.textGray : styles.textDarkGray)
            ]}>
              {cat === 'all' ? t('reports.allSales') : t(`wholesale.categories.${cat}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      {loading ? (
        <ActivityIndicator size="large" color="#1D9E75" />
      ) : (
        <>
          <Ionicons name="business-outline" size={64} color="#ccc" />
          <Text style={[styles.emptyText, isDark ? styles.textGray : styles.textDarkGray]}>
            {t('reports.nothingFound')}
          </Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      <FlatList
        data={ads}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={<UniversalBanner />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={['#1D9E75']} tintColor="#1D9E75" />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgLight: { backgroundColor: '#F8F9FA' },
  bgDark: { backgroundColor: '#121212' },
  listContent: { padding: 16 },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12, marginLeft: 4 },
  filterScroll: { paddingBottom: 8 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  filterChipActive: { backgroundColor: '#1D9E75' },
  chipLight: { backgroundColor: '#fff' },
  chipDark: { backgroundColor: '#1E1E1E' },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  textWhite: { color: '#fff' },
  textBlack: { color: '#000' },
  textGray: { color: '#888' },
  textDarkGray: { color: '#555' },
  emptyContainer: { height: 400, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 16 },
});
