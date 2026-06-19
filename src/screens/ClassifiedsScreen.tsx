import React, { useState, useEffect } from 'react';
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
import { useClassifieds } from '../hooks/useClassifieds';
import { ClassifiedCategory } from '../types/ads';
import ClassifiedCard from '../components/market/ClassifiedCard';
import CreateClassifiedModal from '../components/market/CreateClassifiedModal';

const CATEGORIES: (ClassifiedCategory | 'all')[] = [
  'all',
  'rent_spot',
  'rent_shop',
  'hire_seller',
  'looking_for_job',
  'sell_equipment',
  'buy_equipment',
  'partnership',
  'other',
];

export default function ClassifiedsScreen() {
  const { t } = useTranslation();
  const { theme } = useAppContext();
  const navigation = useNavigation<any>();
  const isDark = theme === 'dark';

  const [selectedCategory, setSelectedCategory] = useState<ClassifiedCategory | 'all'>('all');
  const [debouncedCategory, setDebouncedCategory] = useState<ClassifiedCategory | 'all'>('all');
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedCategory(selectedCategory);
    }, 300);
    return () => clearTimeout(handler);
  }, [selectedCategory]);

  const { classifieds, loading, refreshing, refresh, loadMore, hasMore } = useClassifieds(
    undefined,
    debouncedCategory === 'all' ? undefined : debouncedCategory
  );

  const renderHeader = () => (
    <View style={styles.header}>
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
              {cat === 'all' ? t('reports.allSales') : t(`classifieds.categories.${cat}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      {loading && classifieds.length === 0 ? (
        <ActivityIndicator size="large" color="#1D9E75" />
      ) : (
        <>
          <Ionicons name="megaphone-outline" size={64} color="#ccc" />
          <Text style={[styles.emptyText, isDark ? styles.textGray : styles.textDarkGray]}>
            {t('reports.nothingFound')}
          </Text>
        </>
      )}
    </View>
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#1D9E75" />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      <FlatList
        data={classifieds}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <ClassifiedCard
            item={item}
            onPress={(id) => navigation.navigate('ClassifiedDetail', { id })}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={['#1D9E75']} tintColor="#1D9E75" />
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      <CreateClassifiedModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={refresh}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgLight: { backgroundColor: '#F8F9FA' },
  bgDark: { backgroundColor: '#121212' },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  header: {
    marginBottom: 16,
  },
  filterScroll: {
    paddingBottom: 8,
  },
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
  filterChipActive: {
    backgroundColor: '#1D9E75',
  },
  chipLight: { backgroundColor: '#fff' },
  chipDark: { backgroundColor: '#1E1E1E' },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  textWhite: { color: '#fff' },
  textGray: { color: '#888' },
  textDarkGray: { color: '#555' },
  emptyContainer: {
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#1D9E75',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
