import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, TextInput, Alert, Clipboard, ActivityIndicator, Dimensions,
  Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { useAppLock } from '../context/AppLockContext';
import RegistrationPromptModal from '../components/RegistrationPromptModal';
import { api } from '../services/api';
import { SyncService } from '../services/syncService';
import { ProfileStats } from '../types/auth';
import { getStats } from '../db/database';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { user, logout, isGuest, updateProfile, convertGuestAccount } = useAuth();
  const { setIsSystemDialogOpen } = useAppLock();

  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.name || '');
  const [lastSync, setLastSync] = useState<Date | null>(user?.lastSyncAt ? new Date(user.lastSyncAt) : null);

  // Conversion state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRegPrompt, setShowRegPrompt] = useState(false);

  useEffect(() => {
    checkRegPrompt();
  }, [isGuest]);

  const checkRegPrompt = async () => {
    if (!isGuest) return;
    try {
      const lastPrompt = await AsyncStorage.getItem('last_reg_prompt');
      const now = Date.now();
      const weekInMs = 7 * 24 * 60 * 60 * 1000;
      if (!lastPrompt || (lastPrompt && now - parseInt(lastPrompt) > weekInMs)) {
        setShowRegPrompt(true);
        await AsyncStorage.setItem('last_reg_prompt', String(now));
      }
    } catch (e) {
      console.warn('Failed to check reg prompt', e);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      if (!isGuest) {
        const remoteStats = await api.get<ProfileStats>('/profile/stats');
        setStats(remoteStats);
      } else {
        // Local fallback
        const local = getStats(3650);
        setStats({
          totalRevenue: local.revenue,
          totalProfit: local.profit,
          totalSales: local.count,
          bestProduct: null,
          memberSince: user?.createdAt || new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Failed to load stats');
    }
  };

  const handleSync = async () => {
    if (isGuest) {
      setShowConvertModal(true);
      return;
    }
    setIsSyncing(true);
    try {
      await SyncService.push();
      setLastSync(new Date());
      loadStats();
    } catch (e) {
      Alert.alert(t('common.error'), t('auth.errorNetwork'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConvert = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), 'Fill in all fields');
      return;
    }
    setIsLoading(true);
    try {
      await convertGuestAccount('email', { email, password, name: user?.name });
      setShowConvertModal(false);
      Alert.alert(t('common.saved'), 'Account successfully linked!');
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickImage = async () => {
    setIsSystemDialogOpen(true);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    setTimeout(() => setIsSystemDialogOpen(false), 1000);

    if (!result.canceled && result.assets[0].base64) {
      try {
        const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await updateProfile({ avatarUrl: base64 });
      } catch (e) {
        Alert.alert(t('common.error'), 'Failed to upload avatar');
      }
    }
  };

  const handleUpdateName = async () => {
    if (newName.trim() === user?.name) {
      setIsEditingName(false);
      return;
    }
    try {
      await updateProfile({ name: newName });
      setIsEditingName(false);
    } catch (e) {
      Alert.alert(t('common.error'), 'Failed to update name');
    }
  };

  const copyReferral = () => {
    Clipboard.setString(user?.referralCode || '');
    Alert.alert(t('profile.referral'), t('profile.referralCopied'));
  };

  const shareReferral = async () => {
    if (await Sharing.isAvailableAsync()) {
      setIsSystemDialogOpen(true);
      await Sharing.shareAsync(`https://savdo.app/join?code=${user?.referralCode}`, {
        dialogTitle: 'Присоединяйся к SavdoApp',
      });
      setTimeout(() => setIsSystemDialogOpen(false), 1000);
    }
  };

  const themeStyles = isDark ? darkStyles : lightStyles;

  const isRecentlySynced = lastSync && (new Date().getTime() - lastSync.getTime() < 5 * 60 * 1000);

  return (
    <ScrollView style={[styles.container, themeStyles.container]}>
      {/* Header Card */}
      <View style={[styles.card, themeStyles.card, styles.headerCard]}>
        <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8}>
          <View style={{ position: 'relative' }}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={50} color="#fff" />
              </View>
            )}
            <View style={styles.editAvatarBadge}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          {isEditingName ? (
            <View style={styles.editNameRow}>
              <TextInput
                style={[styles.nameInput, themeStyles.input]}
                value={newName}
                onChangeText={setNewName}
                autoFocus
              />
              <TouchableOpacity onPress={handleUpdateName}>
                <Ionicons name="checkmark-circle" size={24} color="#1D9E75" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={[styles.name, themeStyles.text]}>{user?.name}</Text>
              <TouchableOpacity onPress={() => setIsEditingName(true)}>
                <Ionicons name="create-outline" size={16} color="#888" />
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.providerBadge, { backgroundColor: isGuest ? '#888' : '#1D9E75' }]}>
            <Text style={styles.providerText}>
              {user?.authProvider === 'google' ? 'Google' :
               user?.authProvider === 'telegram' ? 'Telegram' :
               user?.authProvider === 'email' ? 'Email' : t('auth.guestBtn')}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statItem, themeStyles.card]}>
          <Text style={styles.statLabel}>{t('common.revenue')}</Text>
          <Text style={[styles.statValue, themeStyles.text]}>{stats?.totalRevenue.toLocaleString()}</Text>
          <Text style={styles.statSub}>{currency.symbol}</Text>
        </View>
        <View style={[styles.statItem, themeStyles.card]}>
          <Text style={styles.statLabel}>{t('common.profit')}</Text>
          <Text style={[styles.statValue, { color: '#1D9E75' }]}>{stats?.totalProfit.toLocaleString()}</Text>
          <Text style={styles.statSub}>{currency.symbol}</Text>
        </View>
        <View style={[styles.statItem, themeStyles.card]}>
          <Text style={styles.statLabel}>{t('home.salesCount')}</Text>
          <Text style={[styles.statValue, themeStyles.text]}>{stats?.totalSales}</Text>
          <Text style={styles.statSub}>{t('reports.pcs')}</Text>
        </View>
        <View style={[styles.statItem, themeStyles.card]}>
          <Text style={styles.statLabel}>{t('profile.bestProduct')}</Text>
          <Text style={[styles.statValue, themeStyles.text, { fontSize: 14 }]} numberOfLines={1}>
            {stats?.bestProduct?.name || '—'}
          </Text>
          <Text style={styles.statSub}>{stats?.bestProduct ? `+${stats.bestProduct.profit.toLocaleString()} ${currency.symbol}` : ''}</Text>
        </View>
      </View>

      {/* Sync Card */}
      <View style={[styles.card, themeStyles.card]}>
        <View style={styles.cardHeader}>
          <Ionicons name="sync-outline" size={20} color="#1D9E75" />
          <Text style={[styles.cardTitle, themeStyles.text]}>{t('profile.sync')}</Text>
        </View>

        {isGuest ? (
          <View style={styles.guestWarning}>
            <Text style={styles.guestWarningText}>{t('profile.guestWarning')}</Text>
            <TouchableOpacity style={styles.bindBtn} onPress={() => setShowConvertModal(true)}>
              <Text style={styles.bindBtnText}>{t('profile.bindAccount')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.syncContent}>
            <View style={styles.syncStatus}>
              <Ionicons
                name={isRecentlySynced ? "checkmark-circle" : "warning"}
                size={24}
                color={isRecentlySynced ? "#1D9E75" : "#F57C00"}
              />
              <View>
                <Text style={[styles.syncStatusText, themeStyles.text]}>
                  {lastSync ? `${t('profile.synced')}: ${lastSync.toLocaleTimeString()}` : t('profile.syncNever')}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#1D9E75' }]}
              onPress={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>{t('profile.sync')}</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Referral Card */}
      <View style={[styles.card, themeStyles.card]}>
        <View style={styles.cardHeader}>
          <Ionicons name="gift-outline" size={20} color="#854F0B" />
          <Text style={[styles.cardTitle, themeStyles.text]}>{t('profile.referral')}</Text>
        </View>
        <Text style={styles.cardDesc}>Поделитесь кодом с друзьями — вместе удобнее вести учёт!</Text>

        <View style={styles.referralRow}>
          <TouchableOpacity style={[styles.referralBox, themeStyles.input]} onPress={copyReferral}>
            <Text style={[styles.referralCode, themeStyles.text]}>{user?.referralCode || '—'}</Text>
            <Ionicons name="copy-outline" size={18} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={shareReferral}>
            <Ionicons name="share-social-outline" size={24} color="#1D9E75" />
          </TouchableOpacity>
        </View>

        <View style={styles.friendsRow}>
          <Text style={themeStyles.text}>{t('profile.friends')}:</Text>
          <Text style={[styles.friendsCount, { color: '#1D9E75' }]}>{user?.referralCount || 0}</Text>
        </View>
      </View>

      {/* Account Actions */}
      <TouchableOpacity style={[styles.card, themeStyles.card, styles.logoutBtn]} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color="#E53935" />
        <Text style={styles.logoutText}>{t('profile.logout')}</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {t('profile.memberSince')} {user ? new Date(user.createdAt).toLocaleDateString() : '—'}
        </Text>
      </View>

      <RegistrationPromptModal
        visible={showRegPrompt}
        onClose={() => setShowRegPrompt(false)}
        onRegister={() => {
          setShowRegPrompt(false);
          setShowConvertModal(true);
        }}
        onBackup={() => {
          setShowRegPrompt(false);
          navigation.navigate('Settings');
        }}
      />

      {/* Conversion Modal */}
      <Modal visible={showConvertModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, themeStyles.card]}>
            <Text style={[styles.modalTitle, themeStyles.text]}>{t('profile.bindAccount')}</Text>
            <Text style={styles.modalDesc}>Введите email и пароль, чтобы сохранить ваши данные в облаке.</Text>

            <TextInput
              style={[styles.input, themeStyles.input]}
              placeholder={t('auth.email')}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, themeStyles.input, { marginTop: 12 }]}
              placeholder={t('auth.password')}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowConvertModal(false)}>
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConvert} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>{t('common.save')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  card: { backgroundColor: '#fff' },
  text: { color: '#333' },
  input: { backgroundColor: '#F9F9F9', borderColor: '#E0E0E0' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
  input: { backgroundColor: '#2C2C2C', borderColor: '#444', color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { margin: 16, marginBottom: 0, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#1D9E75' },
  avatarPlaceholder: { backgroundColor: '#1D9E75', justifyContent: 'center', alignItems: 'center' },
  editAvatarBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#1D9E75', width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  headerInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 20, fontWeight: 'bold' },
  nameInput: { flex: 1, fontSize: 18, borderBottomWidth: 1, borderBottomColor: '#1D9E75', paddingVertical: 2 },
  providerBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  providerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  statItem: { width: (width - 44) / 2, borderRadius: 16, padding: 16, gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  statLabel: { fontSize: 12, color: '#888' },
  statValue: { fontSize: 20, fontWeight: 'bold' },
  statSub: { fontSize: 11, color: '#999' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  cardDesc: { fontSize: 13, color: '#888', marginBottom: 16 },
  syncContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  syncStatus: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  syncStatusText: { fontSize: 14 },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, minWidth: 100, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: 'bold' },
  guestWarning: { gap: 12 },
  guestWarningText: { fontSize: 14, color: '#E53935' },
  bindBtn: { backgroundColor: '#1D9E75', padding: 12, borderRadius: 10, alignItems: 'center' },
  bindBtnText: { color: '#fff', fontWeight: 'bold' },
  referralRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  referralBox: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, borderWidth: 1 },
  referralCode: { fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  shareBtn: { padding: 8 },
  friendsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  friendsCount: { fontSize: 16, fontWeight: 'bold' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  logoutText: { color: '#E53935', fontWeight: 'bold', fontSize: 16 },
  footer: { padding: 32, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#999' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  modalDesc: { fontSize: 14, color: '#888', marginBottom: 20 },
  input: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 16 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  cancelBtnText: { fontWeight: 'bold', color: '#888' },
  confirmBtn: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 10, backgroundColor: '#1D9E75' },
  confirmBtnText: { fontWeight: 'bold', color: '#fff' },
});
