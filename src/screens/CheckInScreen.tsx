import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Animated
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

import { useCheckInStatus } from '../hooks/useCheckInStatus';
import { useAppContext } from '../context/AppContext';
import { Colors, Shadow } from '../constants/theme';

export default function CheckInScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const { checkInStatus, todayStatus, todayRecord, submitCheckIn, loading: submitting } = useCheckInStatus();

  // Camera permissions
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Active view: 'menu' | 'gps' | 'nfc' | 'qr' | 'success'
  const [activeView, setActiveView] = useState<'menu' | 'gps' | 'nfc' | 'qr' | 'success'>('menu');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Determine enabled methods
  const enabledMethods = useMemo(() => {
    if (!checkInStatus?.methods) return [];
    const list: Array<'gps' | 'nfc' | 'qr'> = [];
    if (checkInStatus.methods.gps) list.push('gps');
    if (checkInStatus.methods.nfc) list.push('nfc');
    if (checkInStatus.methods.qr) list.push('qr');
    return list;
  }, [checkInStatus]);

  // Methods already completed
  const completedMethods = useMemo(() => {
    if (!todayRecord?.methodsUsed) return [];
    return todayRecord.methodsUsed.map((m: any) => m.method);
  }, [todayRecord]);

  // Methods remaining to verify
  const remainingMethods = useMemo(() => {
    return enabledMethods.filter(m => !completedMethods.includes(m));
  }, [enabledMethods, completedMethods]);

  // NFC start/stop session handling
  useEffect(() => {
    NfcManager.start().catch((err) => {
      console.warn('NFC start failed:', err);
    });
    return () => {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  // Handlers for check-in submissions
  const handleSuccess = useCallback((status: string) => {
    setErrorMessage(null);
    if (status === 'confirmed') {
      setActiveView('success');
      setTimeout(() => {
        navigation.goBack();
      }, 1800);
    } else {
      setActiveView('menu');
      setStatusMessage(t('checkIn.statusPartial'));
    }
  }, [navigation, t]);

  const handleError = useCallback((err: any) => {
    console.warn('Check-in failed:', err);
    let msg = err.message || t('common.error');
    if (err.code === 'OUT_OF_RANGE' && typeof err.distance === 'number') {
      msg = t('checkIn.errorOutOfRange', { distance: Math.round(err.distance) });
    } else if (err.code === 'NFC_MISMATCH') {
      msg = t('checkIn.errorNfcMismatch');
    } else if (err.code === 'QR_MISMATCH') {
      msg = t('checkIn.errorQrMismatch');
    } else if (err.code === 'METHOD_ALREADY_USED') {
      msg = t('checkIn.methodAlreadyUsed');
    }
    setErrorMessage(msg);
    setActiveView('menu');
  }, [t]);

  // 1. GPS Flow
  const triggerGps = useCallback(async () => {
    setActiveView('gps');
    setErrorMessage(null);
    setStatusMessage(t('checkIn.checkingGps'));
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied');
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const res = await submitCheckIn('gps', {
        gps: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        },
      });

      handleSuccess(res.status);
    } catch (err: any) {
      handleError(err);
    }
  }, [submitCheckIn, handleSuccess, handleError, t]);

  // 2. NFC Flow
  const triggerNfc = useCallback(async () => {
    setActiveView('nfc');
    setErrorMessage(null);
    setStatusMessage(t('checkIn.checkingNfc'));
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      if (tag && tag.id) {
        const res = await submitCheckIn('nfc', { nfcTagUid: tag.id });
        handleSuccess(res.status);
      } else {
        throw new Error('NFC tag reading failed');
      }
    } catch (err: any) {
      handleError(err);
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }, [submitCheckIn, handleSuccess, handleError, t]);

  // 3. QR Flow
  const triggerQr = useCallback(async () => {
    setErrorMessage(null);
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        setErrorMessage('Camera permission required for scanning QR codes');
        return;
      }
    }
    setActiveView('qr');
    setStatusMessage(t('checkIn.checkingQr'));
  }, [cameraPermission, requestCameraPermission, t]);

  const handleQrScanned = useCallback(async ({ data }: { data: string }) => {
    setActiveView('menu'); // Exit camera view immediately
    try {
      const res = await submitCheckIn('qr', { qrToken: data });
      handleSuccess(res.status);
    } catch (err: any) {
      handleError(err);
    }
  }, [submitCheckIn, handleSuccess, handleError]);

  // Check and run automatic silent flows
  useEffect(() => {
    if (todayStatus === 'confirmed') {
      setActiveView('success');
      setTimeout(() => {
        navigation.goBack();
      }, 1500);
      return;
    }

    // Single enabled method flow
    if (enabledMethods.length === 1 && remainingMethods.length === 1) {
      const singleMethod = remainingMethods[0];
      if (singleMethod === 'gps') {
        triggerGps();
      } else if (singleMethod === 'nfc') {
        triggerNfc();
      } else if (singleMethod === 'qr') {
        triggerQr();
      }
    }
    // Multiple enabled: try GPS silently first (saves a tap for both single-factor and two-factor modes)
    else if (enabledMethods.length > 1 && completedMethods.length === 0) {
      if (enabledMethods.includes('gps')) {
        triggerGps();
      }
    }
  }, [enabledMethods, remainingMethods, checkInStatus, completedMethods, todayStatus, triggerGps, triggerNfc, triggerQr, navigation]);

  return (
    <View style={[styles.container, themeStyles.container]}>
      <View style={{ height: Math.max(insets.top, 16) }} />

      {/* Header */}
      <View style={[styles.header, themeStyles.borderBottom]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={isDark ? '#FFF' : '#333'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, themeStyles.text]}>{t('checkIn.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* SUCCESS VIEW */}
      {activeView === 'success' && (
        <View style={styles.centered}>
          <View style={styles.successBadge}>
            <Ionicons name="checkmark-circle" size={80} color={Colors.primary} />
          </View>
          <Text style={[styles.title, themeStyles.text, { marginTop: 24 }]}>
            {t('checkIn.statusConfirmed')}
          </Text>
        </View>
      )}

      {/* QR CAMERA VIEW */}
      {activeView === 'qr' && (
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={handleQrScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          />
          <View style={[styles.qrOverlay, { paddingTop: insets.top + 20 }]}>
            <TouchableOpacity onPress={() => setActiveView('menu')} style={styles.qrCloseBtn}>
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.qrMask} />
            <Text style={styles.qrPrompt}>{t('checkIn.checkingQr')}</Text>
          </View>
        </View>
      )}

      {/* LOADING & SILENT FLOW STATES */}
      {(activeView === 'gps' || activeView === 'nfc') && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[styles.statusMsg, themeStyles.textSub, { marginTop: 16 }]}>{statusMessage}</Text>
          <TouchableOpacity style={[styles.cancelBtn, { marginTop: 24 }]} onPress={() => setActiveView('menu')}>
            <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MENU VIEW */}
      {activeView === 'menu' && (
        <View style={styles.menuContainer}>
          {errorMessage && (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={20} color="#FF3B30" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {statusMessage && !errorMessage && (
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={20} color={Colors.primary} />
              <Text style={[styles.infoText, { color: Colors.primary }]}>{statusMessage}</Text>
            </View>
          )}

          {/* Verification Progress details */}
          {checkInStatus.verificationMode === 'two_factor' && (
            <Text style={[styles.progressTitle, themeStyles.text]}>
              {t('checkIn.remainingVerify', {
                methods: remainingMethods.map(m => t(`checkIn.${m}CardTitle`)).join(' + ')
              })}
            </Text>
          )}

          <Text style={[styles.sectionTitle, themeStyles.textSub]}>Доступные способы</Text>

          {remainingMethods.map((method) => {
            const isGps = method === 'gps';
            const isNfc = method === 'nfc';
            const color = isGps ? Colors.primary : isNfc ? '#3F51B5' : '#FF9800';
            const icon = isGps ? 'location' : isNfc ? 'card' : 'qr-code';

            return (
              <TouchableOpacity
                key={method}
                style={[styles.methodCard, themeStyles.card, Shadow.sm]}
                onPress={isGps ? triggerGps : isNfc ? triggerNfc : triggerQr}
                disabled={submitting}
              >
                <View style={[styles.methodIconWrap, { backgroundColor: color + '15' }]}>
                  <Ionicons name={icon} size={24} color={color} />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={[styles.methodName, themeStyles.text]}>{t(`checkIn.${method}CardTitle`)}</Text>
                  <Text style={styles.methodDesc}>{t(`checkIn.${method}CardDesc`)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  successBadge: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', ...Shadow.md },
  statusMsg: { fontSize: 14, textAlign: 'center' },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20, backgroundColor: '#8E8E93' },
  cancelBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  qrOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 60 },
  qrCloseBtn: { alignSelf: 'flex-start', marginLeft: 24, padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
  qrMask: { width: 220, height: 220, borderWidth: 2, borderColor: Colors.primary, borderRadius: 12, backgroundColor: 'transparent' },
  qrPrompt: { color: '#FFF', fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },
  menuContainer: { padding: 16 },
  errorCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FFD6D4', borderRadius: 12, gap: 10, marginBottom: 16 },
  errorText: { flex: 1, color: '#FF3B30', fontSize: 13, fontWeight: '500' },
  infoCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#E8F5E9', borderRadius: 12, gap: 10, marginBottom: 16 },
  infoText: { flex: 1, fontSize: 13, fontWeight: '500' },
  progressTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: Colors.primary },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, paddingLeft: 4 },
  methodCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 12 },
  methodIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  methodName: { fontSize: 15, fontWeight: 'bold' },
  methodDesc: { fontSize: 12, color: '#8E8E93', marginTop: 2, lineHeight: 16 },
});
