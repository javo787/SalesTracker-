import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { NewsArticle } from '../../types/ads';
import { useAppContext } from '../../context/AppContext';

interface Props {
  article: NewsArticle;
}

export default function NewsCard({ article }: Props) {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const lang = i18n.language as 'ru' | 'tg' | 'uz';

  const title = article[`title_${lang}`] || article.title_ru;
  const summary = article[`summary_${lang}`] || article.summary_ru;

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'customs': return 'document-text-outline';
      case 'currency': return 'cash-outline';
      case 'logistics': return 'bus-outline';
      case 'construction_materials': return 'construct-outline';
      case 'textile': return 'shirt-outline';
      case 'fuel': return 'flame-outline';
      default: return 'newspaper-outline';
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}
      onPress={() => Linking.openURL(article.url)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.categoryInfo}>
          <Ionicons name={getCategoryIcon(article.category)} size={16} color="#1D9E75" />
          <Text style={styles.source}>{article.source}</Text>
        </View>
        <Ionicons name="open-outline" size={16} color="#888" />
      </View>

      <Text style={[styles.title, isDark ? styles.textWhite : styles.textBlack]}>
        {title}
      </Text>

      <Text style={[styles.summary, isDark ? styles.textGray : styles.textDarkGray]} numberOfLines={3}>
        {summary}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.readMore}>{t('news.readMore')}</Text>
        <Ionicons name="chevron-forward" size={14} color="#1D9E75" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardLight: { backgroundColor: '#fff' },
  cardDark: { backgroundColor: '#1E1E1E' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  source: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    lineHeight: 22,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readMore: {
    fontSize: 12,
    color: '#1D9E75',
    fontWeight: 'bold',
  },
  textWhite: { color: '#fff' },
  textBlack: { color: '#000' },
  textGray: { color: '#aaa' },
  textDarkGray: { color: '#555' },
});
