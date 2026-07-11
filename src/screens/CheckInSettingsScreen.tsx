import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Switch, ActivityIndicator, Animated, Modal, Share,
  Linking
} from 'react-native';

const SUPPORT_URL = 'https://torgo.vercel.app/support';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

import { useShop } from '../context/ShopContext';
import { useAppContext } from '../context/AppContext';
import { useCheckInSettings, CheckInSettings } from '../hooks/useCheckInSettings';
import { Colors, Shadow } from '../constants/theme';

export default function CheckInSettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isOwner } = useShop();
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const { settings, isLoading, error, updateSettings, registerNfcTag, rotateQrToken } = useCheckInSettings();
  const [fadeAnim] = useState(new Animated.Value(1));
  const qrRef = React.useRef<any>(null);

  // Map state
  const [mapVisible, setMapVisible] = useState(false);
  const [mapCoords, setMapCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // NFC scanning state
  const [scanningNfc, setScanningNfc] = useState(false);

  // Initialize NFC Manager
  useEffect(() => {
    NfcManager.start().catch((err) => {
      console.warn('NFC initialization failed or NFC is not supported on this device/simulator:', err);
    });
  }, []);

  useEffect(() => {
    if (!isOwner) {
      Alert.alert(t('common.error'), t('sellers.ownerOnly') || "Доступно только владельцу магазина");
      navigation.goBack();
    }
  }, [isOwner, navigation, t]);

  const handleMasterToggle = async (val: boolean) => {
    if (!settings) return;
    try {
      await updateSettings({ enabled: val });
      if (val) {
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error updating settings');
    }
  };

  const showWarningToastIfNeeded = useCallback((res: any) => {
    if (res?.warning === 'verificationModeDowngraded') {
      Alert.alert(
        t('common.success'),
        t('checkIn.warningModeDowngraded') || 'Режим проверки автоматически изменен на Удобный, так как включено менее двух способов.'
      );
    }
  }, [t]);

  const toggleGps = async (val: boolean) => {
    if (!settings) return;
    try {
      if (val && !settings.gps.latitude) {
        // Automatically open map if turning on for the first time or coords are null
        await openMapPicker();
      } else {
        const res = await updateSettings({
          gps: {
            ...settings.gps,
            enabled: val,
          }
        });
        showWarningToastIfNeeded(res);
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error updating GPS');
    }
  };

  const openMapPicker = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let defaultCoords = { latitude: 41.311081, longitude: 69.240562 }; // Default Tashkent

      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        defaultCoords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
      } else {
        Alert.alert(
          t('common.error'),
          t('common.error') || 'Разрешение на геолокацию не предоставлено. Используется точка по умолчанию.'
        );
      }

      setMapCoords({
        latitude: settings?.gps.latitude || defaultCoords.latitude,
        longitude: settings?.gps.longitude || defaultCoords.longitude,
      });
      setMapVisible(true);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error requesting location');
    }
  };

  const saveMapLocation = async () => {
    if (!settings || !mapCoords) return;
    try {
      const res = await updateSettings({
        gps: {
          ...settings.gps,
          enabled: true,
          latitude: mapCoords.latitude,
          longitude: mapCoords.longitude,
        }
      });
      showWarningToastIfNeeded(res);
      setMapVisible(false);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error saving GPS position');
    }
  };

  const handleRadiusChange = async (radius: number) => {
    if (!settings) return;
    try {
      await updateSettings({
        gps: {
          ...settings.gps,
          radiusMeters: radius,
        }
      });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error updating radius');
    }
  };

  const toggleNfc = async (val: boolean) => {
    if (!settings) return;
    try {
      const res = await updateSettings({
        nfc: {
          ...settings.nfc,
          enabled: val,
        }
      });
      showWarningToastIfNeeded(res);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error updating NFC');
    }
  };

  const handleNfcHelp = async () => {
    const botUsername = process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME;
    const message = encodeURIComponent('Здравствуйте! Нужна помощь с настройкой NFC-метки в Torgo.');
    try {
      const hasTelegramApp = await Linking.canOpenURL(`tg://resolve?domain=${botUsername}`);
      if (hasTelegramApp) {
        await Linking.openURL(`https://t.me/${botUsername}?text=${message}`);
      } else {
        await Linking.openURL(SUPPORT_URL);
      }
    } catch (e) {
      await Linking.openURL(SUPPORT_URL);
    }
  };

  const handleBindNfc = async () => {
    try {
      setScanningNfc(true);
      // Scan NFC Tag UID
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      if (tag && tag.id) {
        await registerNfcTag(tag.id);
        Alert.alert(t('common.success'), t('checkIn.nfcScanSuccess') || 'NFC-метка успешно привязана!');
      } else {
        throw new Error('NFC Tag ID is null');
      }
    } catch (e: any) {
      console.warn('NFC Scan failed:', e);
      Alert.alert(t('common.error'), t('checkIn.nfcScanError') || 'Не удалось считать NFC-метку.');
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setScanningNfc(false);
    }
  };

  const toggleQr = async (val: boolean) => {
    if (!settings) return;
    try {
      // Rotate token on first enable if none exists
      let currentToken = settings.qr.currentToken;
      if (val && !currentToken) {
        currentToken = await rotateQrToken();
      }

      const res = await updateSettings({
        qr: {
          ...settings.qr,
          enabled: val,
          currentToken,
        }
      });
      showWarningToastIfNeeded(res);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error updating QR settings');
    }
  };

  const handleRotationChange = async (rotation: 'static' | 'daily') => {
    if (!settings) return;
    try {
      await updateSettings({
        qr: {
          ...settings.qr,
          rotation,
        }
      });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error updating QR rotation');
    }
  };

  const handleManualQrRotate = async () => {
    try {
      await rotateQrToken();
      Alert.alert(t('common.success'), t('common.saved') || 'Успешно обновлено!');
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error rotating QR token');
    }
  };

  const handleShareQr = async () => {
    if (!settings?.qr.currentToken || !qrRef.current) return;
    try {
      qrRef.current.toDataURL(async (dataURL: string) => {
        try {
          const fileUri = FileSystem.cacheDirectory + 'torgo-checkin-qr.png';
          await FileSystem.writeAsStringAsync(fileUri, dataURL, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, { mimeType: 'image/png', dialogTitle: t('checkIn.qrSharePrint') });
          } else {
            Alert.alert(t('common.error'), 'Sharing is not available on this device');
          }
        } catch (innerErr: any) {
          Alert.alert(t('common.error'), innerErr.message || 'Error sharing');
        }
      });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error sharing');
    }
  };

  const handleVerificationModeChange = async (mode: 'any' | 'two_factor') => {
    if (!settings) return;
    try {
      await updateSettings({
        verificationMode: mode,
      });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Error updating verification mode');
    }
  };

  if (!isOwner) {
    return null;
  }

  if (isLoading && !settings) {
    return (
      <View style={[styles.container, themeStyles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  let activeMethodsCount = 0;
  if (settings?.gps.enabled) activeMethodsCount++;
  if (settings?.nfc.enabled) activeMethodsCount++;
  if (settings?.qr.enabled) activeMethodsCount++;
  const canStrictMode = activeMethodsCount >= 2;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={[styles.container, themeStyles.container]}>
      <View style={{ height: Math.max(insets.top, 16) }} />

      {/* Header */}
      <View style={[styles.header, themeStyles.borderBottom]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={isDark ? '#FFF' : '#333'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, themeStyles.text]}>{t('checkIn.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Master Toggle */}
        <View style={[styles.card, themeStyles.card, styles.row]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, themeStyles.text]}>{t('checkIn.title')}</Text>
            <Text style={styles.cardDesc}>
              {settings?.enabled ? t('checkIn.enabled') : t('checkIn.disabled')}
            </Text>
          </View>
          <Switch
            value={settings?.enabled ?? false}
            onValueChange={handleMasterToggle}
            trackColor={{ false: '#767577', true: Colors.primary }}
            thumbColor="#FFF"
          />
        </View>

        {settings?.enabled && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={[styles.sectionTitle, themeStyles.text]}>Способы проверки</Text>

            {/* GPS Card */}
            <View style={[styles.card, themeStyles.card, { marginBottom: 16 }]}>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <View style={[styles.row, { gap: 10, flex: 1 }]}>
                  <View style={[styles.iconWrap, { backgroundColor: '#E8F5E9' }]}>
                    <Ionicons name="location" size={20} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, themeStyles.text]}>{t('checkIn.gpsCardTitle')}</Text>
                    <Text style={styles.cardDesc}>{t('checkIn.gpsCardDesc')}</Text>
                  </View>
                </View>
                <Switch
                  value={settings?.gps.enabled ?? false}
                  onValueChange={toggleGps}
                  trackColor={{ false: '#767577', true: Colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              {(settings?.gps.enabled) && (
                <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: isDark ? '#2A2A2A' : '#EEE', paddingTop: 16 }}>
                  <TouchableOpacity style={styles.mapBtn} onPress={openMapPicker}>
                    <Ionicons name="map-outline" size={18} color="#FFF" />
                    <Text style={styles.mapBtnText}>{t('checkIn.selectMapPoint')}</Text>
                  </TouchableOpacity>

                  {settings.gps.latitude && (
                    <Text style={[styles.coordsText, themeStyles.textSub]}>
                      Координаты: {settings.gps.latitude.toFixed(6)}, {settings.gps.longitude?.toFixed(6)}
                    </Text>
                  )}

                  <Text style={[styles.subLabel, themeStyles.text, { marginTop: 12 }]}>{t('checkIn.radiusLabel')}</Text>
                  <View style={styles.segmented}>
                    {([50, 100, 150, 200] as const).map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.segItem, settings.gps.radiusMeters === r && styles.segItemActive]}
                        onPress={() => handleRadiusChange(r)}
                      >
                        <Text style={[styles.segText, settings.gps.radiusMeters === r && styles.segTextActive]}>
                          {r}м
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* NFC Card */}
            <View style={[styles.card, themeStyles.card, { marginBottom: 16 }]}>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <View style={[styles.row, { gap: 10, flex: 1 }]}>
                  <View style={[styles.iconWrap, { backgroundColor: '#E8EAF6' }]}>
                    <Ionicons name="card" size={20} color="#3F51B5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, themeStyles.text]}>{t('checkIn.nfcCardTitle')}</Text>
                    <Text style={styles.cardDesc}>{t('checkIn.nfcCardDesc')}</Text>
                  </View>
                </View>
                <Switch
                  value={settings?.nfc.enabled ?? false}
                  onValueChange={toggleNfc}
                  trackColor={{ false: '#767577', true: Colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}
                onPress={handleNfcHelp}
              >
                <Ionicons name="help-circle-outline" size={16} color="#3F51B5" />
                <Text style={{ fontSize: 13, color: '#3F51B5', fontWeight: '600' }}>
                  {t('checkIn.nfcHelpLink') || 'Помощь с настройкой'}
                </Text>
              </TouchableOpacity>

              {(settings?.nfc.enabled) && (
                <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: isDark ? '#2A2A2A' : '#EEE', paddingTop: 16 }}>
                  {settings.nfc.nfcRegistered ? (
                    <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
                      <Text style={[styles.nfcStatusText, themeStyles.text]}>
                        {t('checkIn.nfcTagBound', { date: formatDate(settings.nfc.registeredAt) })}
                      </Text>
                    </View>
                  ) : null}

                  <TouchableOpacity style={[styles.mapBtn, { backgroundColor: '#3F51B5' }]} onPress={handleBindNfc} disabled={scanningNfc}>
                    {scanningNfc ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="scan-outline" size={18} color="#FFF" />
                        <Text style={styles.mapBtnText}>
                          {settings.nfc.nfcRegistered ? t('checkIn.rebindNfcTag') : t('checkIn.bindNfcTag')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* QR Card */}
            <View style={[styles.card, themeStyles.card, { marginBottom: 16 }]}>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <View style={[styles.row, { gap: 10, flex: 1 }]}>
                  <View style={[styles.iconWrap, { backgroundColor: '#FFF3E0' }]}>
                    <Ionicons name="qr-code" size={20} color="#FF9800" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, themeStyles.text]}>{t('checkIn.qrCardTitle')}</Text>
                    <Text style={styles.cardDesc}>{t('checkIn.qrCardDesc')}</Text>
                  </View>
                </View>
                <Switch
                  value={settings?.qr.enabled ?? false}
                  onValueChange={toggleQr}
                  trackColor={{ false: '#767577', true: Colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              {(settings?.qr.enabled) && (
                <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: isDark ? '#2A2A2A' : '#EEE', paddingTop: 16 }}>
                  <Text style={[styles.subLabel, themeStyles.text]}>{t('checkIn.qrRotationLabel')}</Text>
                  <View style={[styles.segmented, { marginBottom: 16 }]}>
                    <TouchableOpacity
                      style={[styles.segItem, settings.qr.rotation === 'static' && styles.segItemActive]}
                      onPress={() => handleRotationChange('static')}
                    >
                      <Text style={[styles.segText, settings.qr.rotation === 'static' && styles.segTextActive]}>
                        {t('checkIn.qrRotationStatic')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segItem, settings.qr.rotation === 'daily' && styles.segItemActive]}
                      onPress={() => handleRotationChange('daily')}
                    >
                      <Text style={[styles.segText, settings.qr.rotation === 'daily' && styles.segTextActive]}>
                        {t('checkIn.qrRotationDaily')}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {settings.qr.currentToken && (
                    <View style={styles.qrContainer}>
                      <QRCode
                        value={settings.qr.currentToken}
                        size={150}
                        color={isDark ? '#FFF' : '#000'}
                        backgroundColor={isDark ? '#1E1E1E' : '#FFF'}
                        getRef={(c) => { qrRef.current = c; }}
                      />
                    </View>
                  )}

                  <View style={[styles.row, { gap: 10, marginTop: 16 }]}>
                    <TouchableOpacity style={[styles.mapBtn, { flex: 1, backgroundColor: '#FF9800' }]} onPress={handleManualQrRotate}>
                      <Ionicons name="refresh-outline" size={18} color="#FFF" />
                      <Text style={styles.mapBtnText}>{t('checkIn.qrRotateBtn')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.mapBtn, { flex: 1, backgroundColor: '#757575' }]} onPress={handleShareQr}>
                      <Ionicons name="share-social-outline" size={18} color="#FFF" />
                      <Text style={styles.mapBtnText}>{t('checkIn.qrSharePrint')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Verification Mode Card — показываем только когда реально можно выбирать между режимами */}
            {canStrictMode && (
              <>
                <Text style={[styles.sectionTitle, themeStyles.text]}>{t('checkIn.verificationModeTitle')}</Text>
                <View style={[styles.card, themeStyles.card]}>
                  <View style={styles.segmented}>
                    <TouchableOpacity
                      style={[styles.segItem, settings?.verificationMode === 'any' && styles.segItemActive]}
                      onPress={() => handleVerificationModeChange('any')}
                    >
                      <Text style={[styles.segTitle, settings?.verificationMode === 'any' && styles.segTextActive]}>
                        {t('checkIn.verificationModeEasyShort')}
                      </Text>
                      <Text style={[styles.segSubtitle, settings?.verificationMode === 'any' && styles.segTextActive]}>
                        {t('checkIn.verificationModeEasySub')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segItem, settings?.verificationMode === 'two_factor' && styles.segItemActive]}
                      onPress={() => handleVerificationModeChange('two_factor')}
                    >
                      <Text style={[styles.segTitle, settings?.verificationMode === 'two_factor' && styles.segTextActive]}>
                        {t('checkIn.verificationModeStrictShort')}
                      </Text>
                      <Text style={[styles.segSubtitle, settings?.verificationMode === 'two_factor' && styles.segTextActive]}>
                        {t('checkIn.verificationModeStrictSub')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </Animated.View>
        )}
      </ScrollView>

      {/* Map Picker Modal */}
      <Modal visible={mapVisible} animationType="slide" transparent={false}>
        <View style={{ flex: 1, backgroundColor: isDark ? '#121212' : '#FFF' }}>
          <View style={{ height: insets.top }} />
          <View style={[styles.header, themeStyles.borderBottom]}>
            <TouchableOpacity onPress={() => setMapVisible(false)} style={styles.backBtn}>
              <Ionicons name="close" size={24} color={isDark ? '#FFF' : '#333'} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, themeStyles.text]}>{t('checkIn.mapModalTitle')}</Text>
            <View style={{ width: 40 }} />
          </View>

          {mapCoords && (
            <MapView
              style={{ flex: 1 }}
              initialRegion={{
                latitude: mapCoords.latitude,
                longitude: mapCoords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }}
              onPress={(e) => setMapCoords(e.nativeEvent.coordinate)}
            >
              <Marker
                draggable
                coordinate={mapCoords}
                onDragEnd={(e) => setMapCoords(e.nativeEvent.coordinate)}
              />
              <Circle
                center={mapCoords}
                radius={settings?.gps.radiusMeters || 100}
                fillColor="rgba(29, 158, 117, 0.25)"
                strokeColor={Colors.primary}
                strokeWidth={1}
              />
            </MapView>
          )}

          <View style={{ padding: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
            <Text style={[styles.cardDesc, { textAlign: 'center', marginBottom: 4 }]}>
              {t('checkIn.mapModalHint')}
            </Text>
            <TouchableOpacity style={[styles.mapBtn, { height: 50, borderRadius: 25 }]} onPress={saveMapLocation}>
              <Text style={[styles.mapBtnText, { fontSize: 16 }]}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F2F2F7' },
  card: { backgroundColor: '#FFF' },
  text: { color: '#1C1C1E' },
  textSub: { color: '#8E8E93' },
  borderBottom: { borderBottomColor: '#C6C6C8', borderBottomWidth: StyleSheet.hairlineWidth },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000000' },
  card: { backgroundColor: '#1C1C1E' },
  text: { color: '#FFFFFF' },
  textSub: { color: '#8E8E93' },
  borderBottom: { borderBottomColor: '#38383A', borderBottomWidth: StyleSheet.hairlineWidth },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { padding: 16, borderRadius: 16, ...Shadow.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: 'bold' },
  cardDesc: { fontSize: 12, color: '#8E8E93', marginTop: 4, lineHeight: 16 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', textTransform: 'uppercase', color: '#8E8E93', letterSpacing: 0.5, marginTop: 24, marginBottom: 8, paddingHorizontal: 4 },
  disabledContainer: { opacity: 0.5 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  mapBtn: { height: 42, borderRadius: 21, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  mapBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  coordsText: { fontSize: 12, color: '#8E8E93', marginTop: 8, textAlign: 'center' },
  subLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  segmented: { flexDirection: 'row', backgroundColor: '#F2F2F7', borderRadius: 8, padding: 2 },
  segItem: { flex: 1, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', borderRadius: 6 },
  segItemActive: { backgroundColor: '#FFF', ...Shadow.sm },
  segText: { fontSize: 13, color: '#8E8E93', fontWeight: '600', textAlign: 'center' },
  segTitle: { fontSize: 14, fontWeight: '700', color: '#8E8E93', textAlign: 'center' },
  segSubtitle: { fontSize: 11, fontWeight: '500', color: '#8E8E93', textAlign: 'center', marginTop: 2, opacity: 0.75 },
  segTextActive: { color: Colors.primary },
  nfcStatusText: { fontSize: 13, color: '#3F51B5', fontWeight: '500' },
  qrContainer: { justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderRadius: 12, marginTop: 16, alignSelf: 'center', borderWidth: 1, borderColor: '#EEE' },
  modeWarningText: { fontSize: 12, color: '#FF3B30', marginTop: 8, textAlign: 'center' },
});
