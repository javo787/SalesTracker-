import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';

export default function NewsEmptyState() {
  const { t } = useTranslation();
  const { theme } = useAppContext();
  const isDark = theme === 'dark';

  return (
    <View style={styles.container}>
      <Ionicons name="newspaper-outline" size={80} color={isDark ? '#333' : '#eee'} />
      <Text style={[styles.text, isDark ? styles.textGray : styles.textDarkGray]}>
        {t('news.noNews')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    height: 500,
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 24,
  },
  textGray: { color: '#888' },
  textDarkGray: { color: '#666' },
});
