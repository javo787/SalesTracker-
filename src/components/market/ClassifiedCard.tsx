import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Classified } from '../../types/ads';
import { useAppContext } from '../../context/AppContext';

interface Props {
  item: Classified;
  onPress: (id: string) => void;
}

export default function ClassifiedCard({ item, onPress }: Props) {
  const { t } = useTranslation();
  const { theme } = useAppContext();
  const isDark = theme === 'dark';

  return (
    <TouchableOpacity
      style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}
      onPress={() => onPress(item._id)}
      activeOpacity={0.7}
    >
      {item.images && item.images.length > 0 ? (
        <Image source={{ uri: item.images[0] }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Ionicons name="image-outline" size={40} color={isDark ? '#444' : '#ccc'} />
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.category, { backgroundColor: isDark ? '#333' : '#f0f0f0', color: '#1D9E75' }]}>
            {t(`classifieds.categories.${item.category}`)}
          </Text>
          {item.moderationStatus === 'pending' && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>{t('classifieds.moderationPending')}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.footer}>
          <View style={styles.location}>
            <Ionicons name="location-outline" size={14} color="#888" />
            <Text style={styles.footerText}>{item.city}{item.market ? ` • ${item.market}` : ''}</Text>
          </View>
          {item.price && (
            <Text style={styles.price}>
              {item.price} {item.currency}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    marginBottom: 12,
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
    width: 100,
    height: 100,
  },
  placeholder: {
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  category: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  textLight: { color: '#333' },
  textDark: { color: '#eee' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: '#888',
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D9E75',
  },
  pendingBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pendingText: {
    fontSize: 9,
    color: '#E65100',
    fontWeight: 'bold',
  }
});
