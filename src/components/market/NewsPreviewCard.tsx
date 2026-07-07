import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useNews } from '../../hooks/useNews';
import { useAppContext } from '../../context/AppContext';

export default function NewsPreviewCard() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const navigation = useNavigation<any>();
  const lang = i18n.language as 'ru' | 'tg' | 'uz' | 'en';

  const { news, loading } = useNews();

  if (loading || !news || news.articles.length === 0) return null;

  const article = news.articles[0];
  // Приоритет языков: таджикский → узбекский → русский → английский (см. NewsCard.tsx)
  const title = article[`title_${lang}`] || article.title_tg || article.title_uz || article.title_ru || article.title_en;

  return (
    <TouchableOpacity
      style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}
      onPress={() => navigation.navigate('News')}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.label}>
          <Ionicons name="newspaper-outline" size={14} color="#fff" />
          <Text style={styles.labelText}>{t('news.title')}</Text>
        </View>
        <Text style={styles.date}>{news.date}</Text>
      </View>

      <Text style={[styles.title, isDark ? styles.textWhite : styles.textBlack]} numberOfLines={2}>
        {title}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.allNews}>{t('reports.allSales')} ›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardLight: { backgroundColor: '#fff' },
  cardDark: { backgroundColor: '#1E1E1E' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1D9E75',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  labelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  date: {
    fontSize: 12,
    color: '#888',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  footer: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  allNews: {
    color: '#1D9E75',
    fontSize: 13,
    fontWeight: '600',
  },
  textWhite: { color: '#fff' },
  textBlack: { color: '#000' },
});
