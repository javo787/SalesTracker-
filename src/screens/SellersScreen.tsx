import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, RefreshControl, ActivityIndicator, Image
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useShop } from '../context/ShopContext';
import { api } from '../services/api';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { Colors, LightTheme, DarkTheme, Radius, Shadow, FontSize, Spacing } from '../constants/theme';
import { useAppContext } from '../context/AppContext';
import { ShopMember, SellerStats } from '../types/auth';

export default function SellersScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { inviteCode, regenerateInviteCode, shopId, isOwner, role, transferOwnership, leaveShop } = useShop();
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const [members, setMembers] = useState<ShopMember[]>([]);
  const [stats, setStats] = useState<SellerStats[]>([]);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [membersData, statsData] = await Promise.all([
        api.get<ShopMember[]>('/shop/members'),
        api.get<{ period: string, stats: SellerStats[] }>(`/shop/seller-stats?period=${period}`)
      ]);
      setMembers(membersData);
      setStats(statsData.stats);
    } catch (e) {
      console.error('Failed to load sellers:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleTransferOwnership = (userId: string, name: string) => {
    Alert.alert(
      t('sellers.makeOwnerTitle') || 'Transfer Ownership',
      t('sellers.makeOwnerConfirm', { name }) || `You will lose owner rights. Transfer to ${name}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.continue'),
          onPress: async () => {
            try {
              await transferOwnership(userId);
              Alert.alert(t('common.success'), t('sellers.makeOwnerSuccess') || 'Ownership transferred');
              loadData();
              // If no longer owner, navigate away or refresh will handle it via drawer update,
              // but explicit navigation to Home is better if this screen is owner-only
              navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'Main' }],
                })
              );
            } catch (e: any) {
              Alert.alert(t('common.error'), e.message);
            }
          }
        }
      ]
    );
  };

  const handleLeaveShop = () => {
    Alert.alert(
      t('sellers.leaveShopTitle') || 'Leave Shop',
      t('sellers.leaveShopConfirm') || 'Are you sure you want to leave the shop?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), // Using delete style for leave
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await leaveShop();
              if (result.ok) {
                // navigation will be handled by ShopProvider/App.tsx logic since hasShop becomes false
              } else if (result.code === 'TRANSFER_REQUIRED') {
                Alert.alert(t('common.error'), t('sellers.leaveShopBlockedDesc'));
              }
            } catch (e: any) {
              Alert.alert(t('common.error'), e.message);
            }
          }
        }
      ]
    );
  };

  const handleMemberActions = (member: ShopMember) => {
    const options: { text: string; style?: 'cancel' | 'default' | 'destructive'; onPress?: () => void }[] = [
      {
        text: t('common.cancel'),
        style: 'cancel'
      }
    ];

    if (member.isSelf) return;

    if (isOwner && member.role !== 'owner') {
      options.unshift({
        text: t('sellers.makeOwnerTitle') || 'Make Owner',
        style: 'default',
        onPress: () => handleTransferOwnership(member.userId, member.displayName)
      });
    }

    if (isOwner) {
      options.push({
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => handleDeactivate(member.userId, member.displayName)
      });
    }

    Alert.alert(member.displayName, member.role === 'owner' ? t('common.owner') : t('common.seller'), options as any);
  };

  const handleDeactivate = (userId: string, name: string) => {
    Alert.alert(
      t('sellers.deactivateTitle') || 'Deactivate Seller',
      t('sellers.deactivateConfirm', { name }) || `Are you sure you want to remove ${name}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/shop/members/${userId}`);
              loadData();
            } catch (e: any) {
              Alert.alert(t('common.error'), e.message);
            }
          }
        }
      ]
    );
  };

  const handleRegenerate = async () => {
    Alert.alert(
      t('sellers.regenerateTitle') || 'Regenerate Code',
      t('sellers.regenerateConfirm') || 'Existing code will stop working. Continue?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.continue'),
          onPress: async () => {
            try {
              await regenerateInviteCode();
            } catch (e: any) {
              Alert.alert(t('common.error'), e.message);
            }
          }
        }
      ]
    );
  };

  const copyToClipboard = async () => {
    if (inviteCode) {
      await Clipboard.setStringAsync(inviteCode);
      Alert.alert(t('common.success'), t('sellers.codeCopied') || 'Code copied to clipboard');
    }
  };

  const isOnline = (lastActive: string) => {
    const lastDate = new Date(lastActive);
    const now = new Date();
    return (now.getTime() - lastDate.getTime()) < 5 * 60 * 1000;
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, themeStyles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, themeStyles.container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={[styles.title, themeStyles.text]}>{t('sellers.teamTitle') || 'Команда'}</Text>
        <View style={styles.periodRow}>
          {(['today', 'week', 'month'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {t(`reports.${p === 'today' ? 'today' : p === 'week' ? 'days7' : 'days30'}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.list}>
        {members.filter(m => m.isActive).map((member) => {
          const memberStats = stats.find(s => s._id === member.userId);
          const online = isOnline(member.lastActiveAt);

          return (
            <View key={member.userId} style={[styles.memberCard, themeStyles.card]}>
              <View style={styles.memberInfo}>
                <View style={styles.avatarWrap}>
                  <View style={[styles.avatar, { backgroundColor: Colors.primaryLight }]}>
                    <Ionicons name="person" size={24} color={Colors.primary} />
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: online ? Colors.primary : '#CCC' }]} />
                </View>
                <View style={styles.nameWrap}>
                  <Text style={[styles.memberName, themeStyles.text]}>{member.displayName}</Text>
                  <Text style={styles.memberSub}>
                    {memberStats?.salesCount || 0} {t('home.salesCount').toLowerCase()} • {online ? 'онлайн' : t('sellers.lastActive', { time: new Date(member.lastActiveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                  </Text>
                </View>
                <View style={styles.revenueWrap}>
                  <Text style={[styles.revenue, themeStyles.text]}>
                    {(memberStats?.revenue || 0).toLocaleString()} {currency.symbol}
                  </Text>
                  {!member.isSelf && (
                    <TouchableOpacity onPress={() => handleMemberActions(member)} style={{ padding: 5 }}>
                      <Ionicons name="ellipsis-vertical" size={20} color={isDark ? '#AAA' : '#666'} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.inviteCard, themeStyles.card]}>
        <Text style={[styles.inviteTitle, themeStyles.text]}>{t('sellers.inviteTitle') || 'Пригласить продавца'}</Text>
        <Text style={styles.inviteDesc}>{t('sellers.inviteDesc') || 'Поделитесь этим кодом с вашим сотрудником. Он должен ввести его при первом входе.'}</Text>

        <View style={styles.codeRow}>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{inviteCode}</Text>
          </View>
          <TouchableOpacity style={styles.copyBtn} onPress={copyToClipboard}>
            <Ionicons name="copy-outline" size={20} color="#FFF" />
            <Text style={styles.copyBtnText}>{t('common.copy') || 'Копировать'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerate}>
          <Text style={styles.regenBtnText}>{t('sellers.regenerateBtn') || 'Перевыпустить код'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.leaveCard, themeStyles.card]}>
        <Text style={[styles.leaveTitle, themeStyles.text]}>{t('sellers.leaveShopTitle') || 'Покинуть магазин'}</Text>
        <Text style={styles.leaveDesc}>
          {isOwner && members.filter(m => m.isActive).length > 1
            ? t('sellers.leaveShopBlockedDesc') || 'Сначала назначьте нового владельца через меню участника, затем сможете покинуть магазин'
            : t('sellers.leaveShopDesc') || 'Вы выйдете из текущего магазина и сможете создать новый или вступить по коду приглашения'}
        </Text>

        <TouchableOpacity
          style={[
            styles.leaveBtn,
            isOwner && members.filter(m => m.isActive).length > 1 && styles.leaveBtnDisabled
          ]}
          onPress={handleLeaveShop}
          disabled={isOwner && members.filter(m => m.isActive).length > 1}
        >
          <Ionicons name="exit-outline" size={20} color="#FFF" />
          <Text style={styles.leaveBtnText}>{t('sellers.leaveShopBtn') || 'Покинуть'}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F8F9FA' },
  card: { backgroundColor: '#FFF' },
  text: { color: '#333' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#121212' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingTop: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 15 },
  periodRow: { flexDirection: 'row', gap: 10 },
  periodBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#EEE' },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: 13, color: '#666' },
  periodTextActive: { color: '#FFF', fontWeight: '600' },
  list: { paddingHorizontal: 20, gap: 12 },
  memberCard: { padding: 16, borderRadius: 16, ...Shadow.sm },
  memberInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { position: 'relative', marginRight: 15 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  statusDot: { position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFF' },
  nameWrap: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '600' },
  memberSub: { fontSize: 12, color: '#999', marginTop: 2 },
  revenueWrap: { alignItems: 'flex-end' },
  revenue: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  deleteText: { fontSize: 12, color: Colors.danger, fontWeight: '500' },
  inviteCard: { margin: 20, padding: 20, borderRadius: 16, ...Shadow.md, borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.primary },
  inviteTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  inviteDesc: { fontSize: 13, color: '#888', lineHeight: 18, marginBottom: 20 },
  codeRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  codeBox: { flex: 1, height: 50, backgroundColor: '#F0F0F0', borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#DDD' },
  codeText: { fontSize: 22, fontWeight: 'bold', letterSpacing: 2, color: Colors.primary },
  copyBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 8 },
  copyBtnText: { color: '#FFF', fontWeight: 'bold' },
  regenBtn: { alignSelf: 'center', padding: 10 },
  regenBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '500' },
  leaveCard: { margin: 20, marginTop: 0, padding: 20, borderRadius: 16, ...Shadow.md },
  leaveTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  leaveDesc: { fontSize: 13, color: '#888', lineHeight: 18, marginBottom: 20 },
  leaveBtn: { backgroundColor: Colors.danger, borderRadius: 10, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  leaveBtnDisabled: { backgroundColor: '#CCC' },
  leaveBtnText: { color: '#FFF', fontWeight: 'bold' },
});
