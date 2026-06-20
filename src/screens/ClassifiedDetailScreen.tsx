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
  Share,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../context/AppContext';
import { marketService } from '../services/marketService';
import { Classified } from '../types/ads';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ClassifiedDetailScreen() {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { id } = route.params;

  const [item, setItem] = useState<Classified | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const fetchDetails = async () => {
    try {
      const data = await marketService.getClassifiedDetails(id);
      setItem(data);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleCall = () => {
    if (item?.userPhone) {
      marketService.incrementClassifiedContact(id);
      Linking.openURL(`tel:${item.userPhone}`);
    }
  };

  const handleShare = async () => {
    if (!item) return;
    try {
      await Share.share({
        message: `${item.title}\n\n${item.description}\n\nЦена: ${item.price} ${item.currency}\nГород: ${item.city}\nТелефон: ${item.userPhone}`,
      });
    } catch (error) {
      console.error(error);
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
            <Ionicons name="image-outline" size={64} color="#ccc" />
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.categoryBadge}>{t(`classifieds.categories.${item.category}`)}</Text>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>

          <Text style={[styles.title, isDark ? styles.textWhite : styles.textBlack]}>{item.title}</Text>

          {item.price && (
            <Text style={styles.price}>
              {item.price} {item.currency}
            </Text>
          )}

          <View style={[styles.divider, isDark ? styles.dividerDark : styles.dividerLight]} />

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color="#888" />
            <Text style={[styles.infoText, isDark ? styles.textGray : styles.textDarkGray]}>
              {item.city}{item.market ? `, ${item.market}` : ''}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark ? styles.textWhite : styles.textBlack]}>
              {t('classifieds.description')}
            </Text>
            <Text style={[styles.description, isDark ? styles.textGray : styles.textDarkGray]}>
              {item.description}
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      <View style={[styles.footer, isDark ? styles.footerDark : styles.footerLight, { paddingBottom: 20 + insets.bottom }]}>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={24} color={isDark ? '#fff' : '#333'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.callBtn} onPress={handleCall}>
          <Ionicons name="call" size={20} color="#fff" />
          <Text style={styles.callBtnText}>{t('classifieds.contactSeller')}</Text>
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
  imageGallery: { height: 300 },
  mainImage: { width: SCREEN_WIDTH, height: 300, resizeMode: 'cover' },
  placeholder: {
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  content: { padding: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    backgroundColor: '#E8F5E9',
    color: '#1D9E75',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  date: { color: '#888', fontSize: 12 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  price: { fontSize: 24, fontWeight: 'bold', color: '#1D9E75', marginBottom: 16 },
  textWhite: { color: '#fff' },
  textBlack: { color: '#000' },
  textGray: { color: '#aaa' },
  textDarkGray: { color: '#444' },
  divider: { height: 1, marginVertical: 16 },
  dividerLight: { backgroundColor: '#eee' },
  dividerDark: { backgroundColor: '#333' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  infoText: { fontSize: 16 },
  section: { marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  description: { fontSize: 16, lineHeight: 24 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
  },
  footerLight: { backgroundColor: '#fff', borderTopColor: '#eee' },
  footerDark: { backgroundColor: '#1E1E1E', borderTopColor: '#333' },
  shareBtn: {
    width: 50,
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  callBtn: {
    flex: 1,
    backgroundColor: '#1D9E75',
    height: 50,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  callBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
