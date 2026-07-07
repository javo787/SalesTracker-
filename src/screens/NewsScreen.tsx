import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
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
import UniversalBanner from '../components/ads/UniversalBanner';
import { NewsArticle } from '../types/ads';

interface NewsSection {
  title: string;
  data: NewsArticle[];
}

// Бэкенд проставляет каждой статье article.date (YYYY-MM-DD, UTC) при склейке
// недельной ленты в /api/news. Группируем по дню публикации, чтобы неделя
// новостей читалась как "Сегодня / Вчера / конкретная дата", а не сплошным
// списком без ориентиров.
function groupArticlesByDay(
  articles: NewsArticle[],
  fallbackDate: string | undefined,
  t: (key: string) => string
): NewsSection[] {
  const groups = new Map<string, NewsArticle[]>();
  for (const article of articles) {
    const date = article.date || fallbackDate || 'unknown';
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(article);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)) // по убыванию даты
    .map(([date, data]) => ({
      title:
        date === todayStr ? t('news.today') : date === yesterdayStr ? t('news.yesterday') : date,
      data,
    }));
}

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

  const sections = React.useMemo(
    () => groupArticlesByDay(news?.articles || [], news?.date, t),
    [news, t]
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
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => item.url || index.toString()}
          renderItem={({ item }) => <NewsCard article={item} />}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeaderWrapper, isDark ? styles.bgDark : styles.bgLight]}>
              <Text style={[styles.sectionHeader, isDark ? styles.textGray : styles.textDarkGray]}>
                {section.title}
              </Text>
            </View>
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={<NewsEmptyState />}
          ListFooterComponent={
            <View style={{ width: '100%' }}>
              <UniversalBanner />
            </View>
          }
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled
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
  sectionHeaderWrapper: {
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  textGray: { color: '#888' },
  textDarkGray: { color: '#555' },
});
