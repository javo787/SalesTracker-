import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { marketService } from '../services/marketService';
import { WholesaleAd } from '../types/ads';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WholesaleDetailScreen() {
  const { t } = useTranslation();
  const { theme } = useAppContext();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const isDark = theme === 'dark';
  const { id } = route.params;

  const [item, setItem] = useState<WholesaleAd | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const fetchDetails = async () => {
    try {
      const data = await marketService.getWholesaleAd(id);
      setItem(data);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleCall = () => {
    if (item?.contactPhone) {
      marketService.incrementWholesaleCall(id);
      Linking.openURL(`tel:${item.contactPhone}`);
    }
  };

  const handleTelegram = () => {
    if (item?.contactTelegram) {
      marketService.incrementWholesaleTelegram(id);
      const username = item.contactTelegram.replace('@', '');
      Linking.openURL(`https://t.me/${username}`);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, isDark ? styles.bgDark : styles.bgLight]}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  if (!item) return null;

  return (
    <View style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      <ScrollView>
        {item.images && item.images.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.imageGallery}>
            {item.images.map((img, index) => (
              <Image key={index} source={{ uri: img }} style={styles.mainImage} />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.mainImage, styles.placeholder]}>
            <Ionicons name="business-outline" size={64} color="#ccc" />
          </View>
        )}

        <View style={styles.content}>
          <Text style={[styles.company, isDark ? styles.textWhite : styles.textBlack]}>{item.companyName}</Text>

          <View style={styles.tagContainer}>
            {item.categories.map((cat, i) => (
              <View key={i} style={[styles.tag, isDark ? styles.tagDark : styles.tagLight]}>
                <Text style={styles.tagText}>{t(`wholesale.categories.${cat}`)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.priceSection}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t('wholesale.minOrder', { amount: '', currency: '' }).replace(': ', '')}</Text>
              <Text style={styles.priceValue}>{item.minOrderAmount} {item.currency}</Text>
            </View>
            {item.priceRange && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{t('classifieds.price')}</Text>
                <Text style={styles.priceValue}>{item.priceRange}</Text>
              </View>
            )}
          </View>

          <View style={[styles.divider, isDark ? styles.dividerDark : styles.dividerLight]} />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark ? styles.textWhite : styles.textBlack]}>
              {t('classifieds.description')}
            </Text>
            <Text style={[styles.description, isDark ? styles.textGray : styles.textDarkGray]}>
              {item.description}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark ? styles.textWhite : styles.textBlack]}>
              {t('classifieds.city')}
            </Text>
            <View style={styles.cities}>
              {item.cities.map((city, i) => (
                <View key={i} style={styles.cityBadge}>
                  <Ionicons name="location-outline" size={14} color="#1D9E75" />
                  <Text style={styles.cityText}>{city}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      <View style={[styles.footer, isDark ? styles.footerDark : styles.footerLight]}>
        {item.contactTelegram && (
          <TouchableOpacity style={styles.tgBtn} onPress={handleTelegram}>
            <Ionicons name="paper-plane" size={24} color="#fff" />
            <Text style={styles.btnText}>{t('wholesale.telegram')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.callBtn} onPress={handleCall}>
          <Ionicons name="call" size={20} color="#fff" />
          <Text style={styles.btnText}>{t('wholesale.call')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgLight: { backgroundColor: '#fff' },
  bgDark: { backgroundColor: '#121212' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imageGallery: { height: 250 },
  mainImage: { width: SCREEN_WIDTH, height: 250, resizeMode: 'cover' },
  placeholder: { backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', width: '100%' },
  content: { padding: 20 },
  company: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  tagLight: { backgroundColor: '#F0F0F0' },
  tagDark: { backgroundColor: '#333' },
  tagText: { fontSize: 13, color: '#666' },
  priceSection: { backgroundColor: '#F9F9F9', borderRadius: 12, padding: 15 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  priceLabel: { color: '#888', fontSize: 14 },
  priceValue: { fontWeight: 'bold', fontSize: 16, color: '#1D9E75' },
  textWhite: { color: '#fff' },
  textBlack: { color: '#000' },
  textGray: { color: '#aaa' },
  textDarkGray: { color: '#444' },
  divider: { height: 1, marginVertical: 20 },
  dividerLight: { backgroundColor: '#eee' },
  dividerDark: { backgroundColor: '#333' },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  description: { fontSize: 16, lineHeight: 24 },
  cities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  cityText: { color: '#1D9E75', fontSize: 14, fontWeight: '500' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, flexDirection: 'row', gap: 10, borderTopWidth: 1 },
  footerLight: { backgroundColor: '#fff', borderTopColor: '#eee' },
  footerDark: { backgroundColor: '#1E1E1E', borderTopColor: '#333' },
  tgBtn: { flex: 1, backgroundColor: '#0088cc', height: 50, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  callBtn: { flex: 1, backgroundColor: '#1D9E75', height: 50, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
