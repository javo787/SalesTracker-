import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { WholesaleAd } from '../../types/ads';
import { useAppContext } from '../../context/AppContext';

interface Props {
  item: WholesaleAd;
  onPress: (id: string) => void;
}

export default function WholesaleCard({ item, onPress }: Props) {
  const { t } = useTranslation();
  const { theme } = useAppContext();
  const isDark = theme === 'dark';

  return (
    <TouchableOpacity
      style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}
      onPress={() => onPress(item._id)}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
        {item.images && item.images.length > 0 ? (
          <Image source={{ uri: item.images[0] }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="business-outline" size={40} color="#ccc" />
          </View>
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PARTNER</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={[styles.company, isDark ? styles.textWhite : styles.textBlack]} numberOfLines={1}>
          {item.companyName}
        </Text>

        <View style={styles.tagContainer}>
          {item.categories?.slice(0, 3).map((cat, i) => (
            <View key={i} style={[styles.tag, isDark ? styles.tagDark : styles.tagLight]}>
              <Text style={styles.tagText}>{t(`wholesale.categories.${cat}`)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <View style={styles.info}>
            <Ionicons name="cart-outline" size={14} color="#1D9E75" />
            <Text style={styles.footerText}>
              {item.minOrderAmount
                ? t('wholesale.minOrder', { amount: item.minOrderAmount, currency: item.currency })
                : t('common.notSpecified') || 'Not specified'}
            </Text>
          </View>
          <View style={styles.info}>
            <Ionicons name="location-outline" size={14} color="#888" />
            <Text style={styles.footerText} numberOfLines={1}>{item.cities?.join(', ') || t('common.notSpecified')}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardLight: { backgroundColor: '#fff' },
  cardDark: { backgroundColor: '#1E1E1E' },
  imageContainer: {
    position: 'relative',
    height: 150,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000',
  },
  content: {
    padding: 12,
  },
  company: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagLight: { backgroundColor: '#F0F0F0' },
  tagDark: { backgroundColor: '#333' },
  tagText: {
    fontSize: 11,
    color: '#666',
  },
  footer: {
    flexDirection: 'column',
    gap: 4,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 12,
    color: '#888',
  },
  textWhite: { color: '#fff' },
  textBlack: { color: '#000' },
});
