import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AdFreeService } from '../../services/AdFreeService';
import { adService } from '../../services/adService';
import { useAppContext } from '../../context/AppContext';

let RewardedAd: any = null;
try {
  const yandex = require('yandex-mobile-ads');
  RewardedAd = yandex.RewardedAd;
} catch (e) {
  console.warn('Yandex RewardedAd not available:', e);
}

export default function AdFreeButton() {
  const { t } = useTranslation();
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';

  const [isAdFreeToday, setIsAdFreeToday] = useState(false);
  const [canWatchToday, setCanWatchToday] = useState(false);
  const [chainLength, setChainLength] = useState(0);
  const [chainRecord, setChainRecord] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isAdLoading, setIsAdLoading] = useState(false);

  const loadState = useCallback(async () => {
    setLoading(true);
    const [adFree, canWatch, chain, record] = await Promise.all([
      AdFreeService.isAdFreeToday(),
      AdFreeService.canWatchToday(),
      AdFreeService.getChainLength(),
      AdFreeService.getChainRecord(),
    ]);
    setIsAdFreeToday(adFree);
    setCanWatchToday(canWatch);
    setChainLength(chain);
    setChainRecord(record);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleWatchVideo = async () => {
    if (!RewardedAd) {
      Alert.alert('', t('adFree.noInternet'));
      return;
    }

    setShowModal(false);
    setIsAdLoading(true);

    try {
      const adUnitId = adService.getRewardedId();
      const rewarded = RewardedAd.createForAdUnitId(adUnitId);

      let rewardedEarned = false;

      rewarded.onAdLoaded(() => {
        setIsAdLoading(false);
        rewarded.show();
      });

      rewarded.onAdFailedToLoad((error: any) => {
        setIsAdLoading(false);
        console.error('Rewarded ad failed to load:', error);
        Alert.alert('', t('adFree.noInternet'));
      });

      rewarded.onAdRewarded(() => {
        rewardedEarned = true;
      });

      rewarded.onAdDismissed(() => {
        if (rewardedEarned) {
          AdFreeService.onRewardedWatched().then(loadState);
        }
      });

      rewarded.load();
    } catch (e) {
      setIsAdLoading(false);
      console.error('Error showing rewarded ad:', e);
      Alert.alert('', t('adFree.noInternet'));
    }
  };

  if (loading) {
    return <ActivityIndicator size="small" color="#1D9E75" />;
  }

  // Determine state
  // STATE A — default (not ad-free today, hasn't watched today)
  // STATE B — watched today, tomorrow will be ad-free
  // STATE C — today is ad-free, can still extend (hasn't watched today)
  // STATE D — today is ad-free, already watched today

  let state = 'A';
  if (isAdFreeToday) {
    state = canWatchToday ? 'C' : 'D';
  } else {
    state = canWatchToday ? 'A' : 'B';
  }

  const renderContent = () => {
    switch (state) {
      case 'A':
        return {
          icon: 'play-circle-outline',
          iconChar: '🎬',
          primary: t('adFree.removeAds'),
          secondary: t('adFree.watch1Video'),
          disabled: false,
        };
      case 'B':
        return {
          icon: 'hourglass-outline',
          iconChar: '⏳',
          primary: t('adFree.waiting'),
          secondary: t('adFree.returnEvening'),
          disabled: true,
        };
      case 'C':
        return {
          icon: 'checkmark-circle-outline',
          iconChar: '✅',
          primary: t('adFree.adFreeToday'),
          secondary: `${t('adFree.chain', { count: chainLength })} · ${t('adFree.extendQ')}`,
          disabled: false,
          btnLabel: t('adFree.watchVideo'),
        };
      case 'D':
        return {
          icon: 'flame',
          iconChar: '🔥',
          primary: t('adFree.adFreeTomorrow'),
          secondary: `${t('adFree.chain', { count: chainLength })} — ${t('adFree.excellent')}`,
          disabled: true,
        };
      default:
        return null;
    }
  };

  const content = renderContent();
  if (!content) return null;

  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          themeStyles.button,
          content.disabled && styles.buttonDisabled,
        ]}
        onPress={() => !content.disabled && setShowModal(true)}
        disabled={content.disabled || isAdLoading}
      >
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>{content.iconChar}</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.primaryText, themeStyles.primaryText]}>
            {content.primary}
          </Text>
          <Text style={styles.secondaryText}>{content.secondary}</Text>
        </View>
        {isAdLoading && (
          <ActivityIndicator size="small" color="#1D9E75" style={styles.loader} />
        )}
      </TouchableOpacity>

      {chainRecord > 0 && (
        <Text style={styles.recordText}>
          {t('adFree.record', { count: chainRecord })}
        </Text>
      )}

      {/* Confirmation Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, themeStyles.modalContent]}>
            <Text style={styles.modalEmoji}>🌙</Text>
            <Text style={[styles.modalTitle, themeStyles.text]}>
              {t('adFree.modalTitle')}
            </Text>
            <Text style={[styles.modalBody, themeStyles.textMuted]}>
              {t('adFree.modalBody')}
            </Text>
            <TouchableOpacity
              style={styles.watchBtn}
              onPress={handleWatchVideo}
            >
              <Text style={styles.watchBtnText}>{t('adFree.watchVideo')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.cancelBtnText}>{t('adFree.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  iconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryText: {
    fontSize: 12,
    color: '#1D9E75',
    marginTop: 2,
  },
  recordText: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    marginTop: 6,
  },
  loader: {
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalEmoji: {
    fontSize: 40,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  watchBtn: {
    width: '100%',
    backgroundColor: '#1D9E75',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  watchBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#888',
    fontSize: 14,
  },
});

const lightStyles = StyleSheet.create({
  button: {
    backgroundColor: '#F0FBF7',
    borderColor: '#1D9E75',
  },
  primaryText: {
    color: '#333',
  },
  modalContent: {
    backgroundColor: '#fff',
  },
  text: {
    color: '#333',
  },
  textMuted: {
    color: '#666',
  },
});

const darkStyles = StyleSheet.create({
  button: {
    backgroundColor: '#16332A',
    borderColor: '#1D9E75',
  },
  primaryText: {
    color: '#EEE',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
  },
  text: {
    color: '#EEE',
  },
  textMuted: {
    color: '#AAA',
  },
});
