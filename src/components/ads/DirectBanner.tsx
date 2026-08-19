import React, { useState, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, Linking, Text, View } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DirectAdConfig, adService } from '../../services/adService';

interface DirectBannerProps {
  config: DirectAdConfig;
}

const sessionDismissedAds = new Set<string>();
const STORAGE_KEY_DISMISSED_ADS = 'direct_banner_dismissed_ads';

export default function DirectBanner({ config }: DirectBannerProps) {
  const { t } = useTranslation();
  const id = config._id || config.id;

  const [isDismissed, setIsDismissed] = useState(() => {
    return id ? sessionDismissedAds.has(id) : false;
  });

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.96);

  useEffect(() => {
    if (!id || isDismissed) return;

    // Load from AsyncStorage to check if dismissed in the last 24 hours
    const checkDismissed = async () => {
      try {
        const storedStr = await AsyncStorage.getItem(STORAGE_KEY_DISMISSED_ADS);
        if (storedStr) {
          const stored = JSON.parse(storedStr) as Record<string, number>;
          const now = Date.now();
          const timestamp = stored[id];
          if (timestamp && now - timestamp < 24 * 60 * 60 * 1000) {
            sessionDismissedAds.add(id);
            setIsDismissed(true);
          }
        }
      } catch (e) {
        console.error('Failed to read dismissed ads from storage', e);
      }
    };

    checkDismissed();
  }, [id, isDismissed]);

  useEffect(() => {
    if (!isDismissed) {
      opacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
      scale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
    }
  }, [isDismissed]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    adService.recordAdShown();
    if (id) {
      adService.recordAdClick(id);
    }
    Linking.openURL(config.targetUrl).catch((err) => console.error("Couldn't load page", err));
  };

  const handleDismiss = async () => {
    if (!id) return;

    sessionDismissedAds.add(id);
    setIsDismissed(true);

    try {
      const storedStr = await AsyncStorage.getItem(STORAGE_KEY_DISMISSED_ADS);
      const stored = storedStr ? (JSON.parse(storedStr) as Record<string, number>) : {};
      stored[id] = Date.now();

      // Clean up old entries (older than 24h)
      const now = Date.now();
      const cleaned: Record<string, number> = {};
      for (const [key, value] of Object.entries(stored)) {
        if (now - value < 24 * 60 * 60 * 1000) {
          cleaned[key] = value;
        }
      }

      await AsyncStorage.setItem(STORAGE_KEY_DISMISSED_ADS, JSON.stringify(cleaned));
    } catch (e) {
      console.error('Failed to save dismissed ad', e);
    }
  };

  if (isDismissed) {
    return null;
  }

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.82}>
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: config.imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Партнер</Text>
          </View>
        </View>

        <View style={styles.contentContainer}>
          <Text style={styles.title}>{config.title || 'Специальное предложение'}</Text>
          {config.subtitle ? (
            <Text style={styles.subtitle}>{config.subtitle}</Text>
          ) : null}

          <View style={styles.ctaButton}>
            <Text style={styles.ctaButtonText}>
              {config.ctaText || t('common.ctaDefault')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleDismiss}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={18} color="#fff" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    margin: 10,
    position: 'relative',
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#f1f3f5',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#1D9E75',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  contentContainer: {
    padding: 15,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6c757d',
    lineHeight: 18,
    marginBottom: 12,
  },
  ctaButton: {
    backgroundColor: '#1D9E75',
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
});
