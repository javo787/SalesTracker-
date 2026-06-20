import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useWholesale } from '../../hooks/useWholesale';
import { useAppContext } from '../../context/AppContext';

export default function WholesalePromoStrip() {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const navigation = useNavigation<any>();

  const { ads, loading } = useWholesale();

  if (loading && ads.length === 0) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#1D9E75" />
      </View>
    );
  }

  if (ads.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark ? styles.textWhite : styles.textBlack]}>
          {t('wholesale.partners')}
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Wholesale')}>
          <Text style={styles.seeAll}>{t('reports.allSales')} ›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {ads.slice(0, 5).map((item) => (
          <TouchableOpacity
            key={item._id}
            style={[styles.promoCard, isDark ? styles.cardDark : styles.cardLight]}
            onPress={() => navigation.navigate('WholesaleDetail', { id: item._id })}
          >
            {item.images && item.images.length > 0 ? (
              <Image source={{ uri: item.images[0] }} style={styles.image} />
            ) : (
              <View style={styles.placeholder} />
            )}
            <View style={styles.content}>
              <Text style={[styles.company, isDark ? styles.textWhite : styles.textBlack]} numberOfLines={1}>
                {item.companyName}
              </Text>
              <Text style={styles.minOrder} numberOfLines={1}>
                {t('wholesale.minOrder', { amount: item.minOrderAmount || 0, currency: item.currency })}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  seeAll: {
    color: '#1D9E75',
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  promoCard: {
    width: 200,
    marginHorizontal: 4,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardLight: { backgroundColor: '#fff' },
  cardDark: { backgroundColor: '#1E1E1E' },
  image: {
    width: '100%',
    height: 100,
    resizeMode: 'cover',
  },
  placeholder: {
    width: '100%',
    height: 100,
    backgroundColor: '#eee',
  },
  content: {
    padding: 10,
  },
  company: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  minOrder: {
    fontSize: 11,
    color: '#1D9E75',
    marginTop: 4,
  },
  textWhite: { color: '#fff' },
  textBlack: { color: '#000' },
  loader: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
