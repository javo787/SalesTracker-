import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { useNews } from '../hooks/useNews';
import { useNewsUnread } from '../hooks/useNewsUnread';
import NewsCard from '../components/market/NewsCard';
import NewsEmptyState from '../components/market/NewsEmptyState';

export default function NewsScreen() {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";

  const { news, loading, refreshing, refresh } = useNews();
  const { markAsRead } = useNewsUnread();

  useFocusEffect(
    React.useCallback(() => {
      markAsRead();
    }, [markAsRead])
  );

  const renderHeader = () => {
    if (!news) return null;
    return (
      <View style={styles.header}>
        <Text style={[styles.updatedAt, isDark ? styles.textGray : styles.textDarkGray]}>
          {t('news.updatedAt', { date: news.date })}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1D9E75" />
        </View>
      ) : (
        <FlatList
          data={news?.articles || []}
          keyExtractor={(_, index) => index.toString()}
          renderItem={({ item }) => <NewsCard article={item} />}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={<NewsEmptyState />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={['#1D9E75']}
              tintColor="#1D9E75"
            />
          }
        />
      )}
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
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  updatedAt: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  textGray: { color: '#888' },
  textDarkGray: { color: '#555' },
});
