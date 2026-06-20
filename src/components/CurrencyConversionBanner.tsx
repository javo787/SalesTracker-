import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';

export default function CurrencyConversionBanner() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const [visible, setVisible] = useState(false);
  const [logEntry, setLogEntry] = useState<any>(null);

  useEffect(() => {
    checkBanner();
  }, []);

  const checkBanner = async () => {
    try {
      const [logStr, seen] = await Promise.all([
        AsyncStorage.getItem('currency_conversion_log'),
        AsyncStorage.getItem('currency_conversion_banner_seen'),
      ]);

      if (seen === 'true' || !logStr) {
        setVisible(false);
        return;
      }

      const log = JSON.parse(logStr);
      if (log && log.length > 0) {
        setLogEntry(log[0]);
        setVisible(true);
      }
    } catch (e) {
      console.error('Failed to check currency banner', e);
    }
  };

  const handleDismiss = async () => {
    setVisible(false);
    await AsyncStorage.setItem('currency_conversion_banner_seen', 'true');
  };

  if (!visible || !logEntry) return null;

  const date = new Date(logEntry.date).toLocaleDateString(
    i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU'
  );

  return (
    <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <View style={styles.content}>
        <Ionicons name="information-circle-outline" size={20} color="#1D9E75" />
        <Text style={[styles.text, isDark ? styles.textDark : styles.textLight]}>
          {t('home.currencyConvertedBanner', {
            from: logEntry.from,
            to: logEntry.to,
            rate: logEntry.rate,
            date
          })}
        </Text>
      </View>
      <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn}>
        <Ionicons name="close" size={20} color={isDark ? '#AAA' : '#888'} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  containerLight: { backgroundColor: '#fff', borderLeftWidth: 4, borderLeftColor: '#1D9E75' },
  containerDark: { backgroundColor: '#1E1E1E', borderLeftWidth: 4, borderLeftColor: '#1D9E75' },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontSize: 13, flex: 1, lineHeight: 18 },
  textLight: { color: '#333' },
  textDark: { color: '#EEE' },
  closeBtn: { padding: 4 },
});
