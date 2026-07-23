import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, RefreshControl, ActivityIndicator, Modal, Switch
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useShop } from '../context/ShopContext';
import { api } from '../services/api';
import { useNavigation } from '@react-navigation/native';
import { Colors, Shadow } from '../constants/theme';
import { useAppContext } from '../context/AppContext';
import { ShopMember, SellerStats } from '../types/auth';
import { todayLocalDate } from '../db/database';

// Единое место описания всех переключаемых прав продавца — labels/описания
// используются и в модалке настройки, и в компактной сводке на карточке.
const PERMISSION_DEFS = [
  {
    key: 'manage_products' as const,
    icon: 'cube-outline' as const,
    title: 'Товары',
    desc: 'Добавлять и редактировать товары (без доступа к закупочным ценам)',
  },
  {
    key: 'manage_debtors' as const,
    icon: 'wallet-outline' as const,
    title: 'Долги',
    desc: 'Создавать и закрывать долги покупателей',
  },
  {
    key: 'manage_team' as const,
    icon: 'people-outline' as const,
    title: 'Команда',
    desc: 'Видеть статистику команды, приглашать и удалять продавцов',
  },
];

export default function SellersScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { inviteCode, regenerateInviteCode, shopId, isOwner, role, transferOwnership, leaveShop, checkInStatus, can } = useShop();
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const [members, setMembers] = useState<ShopMember[]>([]);
  const [stats, setStats] = useState<SellerStats[]>([]);
  const [checkInHistory, setCheckInHistory] = useState<any[]>([]);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [togglingPermKey, setTogglingPermKey] = useState<string | null>(null);
  const [permissionsModalUserId, setPermissionsModalUserId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isOwner && !can('manage_team')) return;
    try {
      setLoadError(false);
      const [membersData, statsData, checkInData] = await Promise.all([
        api.get<{ members: ShopMember[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('/shop/members?limit=100'),
        api.get<{ period: string, stats: SellerStats[] }>(`/shop/seller-stats?period=${period}`),
        api.get<any[]>('/shop/checkin/history?period=week').catch(() => [])
      ]);
      setMembers(membersData.members);
      setStats(statsData.stats);
      setCheckInHistory(checkInData);
    } catch (e) {
      console.error('Failed to load sellers:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, isOwner, can]);

  useEffect(() => {
    if (!isOwner && !can('manage_team')) {
      Alert.alert(t('common.error'), t('sellers.ownerOnly') || "Доступно только владельцу магазина");
      navigation.goBack();
      return;
    }
    loadData();
  }, [loadData, isOwner, can, navigation, t]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const togglePermission = async (member: ShopMember, perm: 'manage_debtors' | 'manage_team' | 'manage_products') => {
    const key = `${member.userId}:${perm}`;
    if (togglingPermKey) return; // один тоггл за раз — избегаем гонки при быстром двойном тапе

    const previous = member.permissions || [];
    const next = previous.includes(perm)
      ? previous.filter(p => p !== perm)
      : [...previous, perm];

    setTogglingPermKey(key);
    // Optimistic update — чип реагирует сразу, не дожидаясь ответа сервера
    // (важно на Render free tier: холодный старт инстанса может занять
    // десятки секунд, и без этого тап выглядел как "не работает").
    setMembers(prev => prev.map(m => (m.userId === member.userId ? { ...m, permissions: next } : m)));

    try {
      await api.patch(`/shop/members/${member.userId}/permissions`, { permissions: next });
    } catch (e: any) {
      // Откатываем на реальную ошибку сервера/сети
      setMembers(prev => prev.map(m => (m.userId === member.userId ? { ...m, permissions: previous } : m)));
      Alert.alert(t('common.error'), e.message || t('sellers.permissionUpdateFailed') || 'Не удалось обновить права');
    } finally {
      setTogglingPermKey(null);
    }
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
              Alert.alert(
                t('common.success'),
                t('sellers.makeOwnerSuccess') || 'Ownership transferred',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
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

  const getPermissionSummary = (member: ShopMember): string => {
    const granted = member.permissions || [];
    if (granted.length === 0) return 'Нет доп. доступов';
    if (granted.length >= PERMISSION_DEFS.length) return 'Все доступы';
    return PERMISSION_DEFS.filter(p => granted.includes(p.key)).map(p => p.title).join(', ');
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

    if (isOwner && member.role !== 'owner') {
      options.unshift({
        text: 'Настроить доступы',
        style: 'default',
        onPress: () => setPermissionsModalUserId(member.userId)
      });
    }

    if ((isOwner || can('manage_team')) && member.role !== 'owner') {
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

  const getCheckInInfo = (member: ShopMember) => {
    if (!checkInStatus.enabled || member.role === 'owner') return null;

    const todayStr = todayLocalDate();
    const userRecord = checkInHistory.find((h: any) => h.userId === member.userId);
    const todayEntry = userRecord?.days?.find((d: any) => d.localDate === todayStr);

    if (!todayEntry || todayEntry.status === 'missing') {
      return { color: Colors.danger, label: t('checkIn.statusMissingLabel', 'не отмечен') };
    }

    if (todayEntry.status === 'partial') {
      const methodNames = (todayEntry.methodsUsed || []).map((m: any) => m.method.toUpperCase()).join(', ');
      return {
        color: Colors.warning,
        label: `${t('checkIn.statusPartial', 'частично')}${methodNames ? ` (${methodNames})` : ''}`,
      };
    }

    if (todayEntry.status === 'confirmed') {
      if (todayEntry.ownerOverride) {
        return { color: Colors.info, label: t('checkIn.statusOverrideBadge', 'подтверждено владельцем') };
      }
      const firstMethod = todayEntry.methodsUsed?.[0];
      const timeStr = firstMethod ? new Date(firstMethod.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const methodStr = firstMethod ? firstMethod.method.toUpperCase() : '';
      return { color: Colors.primary, label: `${timeStr}${methodStr ? ` · ${methodStr}` : ''}` };
    }

    return null;
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, themeStyles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, themeStyles.container, styles.centered]}>
        <Ionicons name="cloud-offline-outline" size={64} color={themeStyles.iconError.color} />
        <Text style={[styles.errorText, themeStyles.text]}>{t('sellers.loadError') || "Не удалось загрузить данные команды"}</Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: Colors.primary }]}
          onPress={() => {
            setLoading(true);
            loadData();
          }}
        >
          <Text style={styles.retryBtnText}>{t('common.retry') || "Повторить"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeCount = members.filter(m => m.isActive).length;
  const totalRevenue = stats.reduce((sum, s) => sum + (s.revenue || 0), 0);

  return (
    <>
    <ScrollView
      style={[styles.container, themeStyles.container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ height: Math.max(insets.top, 16) + 8 }} />
      <View style={styles.header}>
        <Text style={[styles.title, themeStyles.text]}>{t('sellers.teamTitle') || 'Команда'}</Text>
        <View style={styles.periodRow}>
          {(['today', 'week', 'month'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, themeStyles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, themeStyles.periodText, period === p && styles.periodTextActive]}>
                {t(`reports.${p === 'today' ? 'today' : p === 'week' ? 'days7' : 'days30'}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.statsRow}>
          <View style={[styles.statChip, themeStyles.card]}>
            <Text style={[styles.statChipValue, themeStyles.text]}>{activeCount}</Text>
            <Text style={[styles.statChipLabel, themeStyles.memberSub]}>{t('sellers.activeSellers') || 'Активные'}</Text>
          </View>
          <View style={[styles.statChip, themeStyles.card]}>
            <Text style={[styles.statChipValue, themeStyles.text]}>
              {totalRevenue.toLocaleString()} {currency.symbol}
            </Text>
            <Text style={[styles.statChipLabel, themeStyles.memberSub]}>{t('common.revenue')}</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionLabel, themeStyles.memberSub]}>
        {t('sellers.membersSectionTitle') || 'Участники'}
      </Text>
      <View style={styles.list}>
        {members.filter(m => m.isActive).map((member) => {
          const memberStats = stats.find(s => s._id === member.userId);
          const online = isOnline(member.lastActiveAt);
          const checkInInfo = getCheckInInfo(member);
          const onlineLabel = online
            ? (t('sellers.online') || 'онлайн')
            : t('sellers.lastActive', { time: new Date(member.lastActiveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });

          return (
            <View key={member.userId} style={[styles.memberCard, themeStyles.card]}>
              <View style={styles.memberCardInner}>
                <View style={[styles.statusAccent, { backgroundColor: checkInInfo ? checkInInfo.color : 'transparent' }]} />
                <View style={styles.memberCardContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                      onPress={() => {
                        (navigation as any).navigate('Main', {
                          screen: 'ReportsDrawer',
                          params: { sellerId: member.userId, sellerName: member.displayName },
                        });
                      }}
                    >
                      <View style={styles.avatarWrap}>
                        <View style={[styles.avatar, { backgroundColor: Colors.primaryLight }]}>
                          <Ionicons name="person" size={22} color={Colors.primary} />
                        </View>
                        <View style={[styles.statusDot, online ? { backgroundColor: Colors.primary } : themeStyles.statusOffline]} />
                      </View>
                      <View style={styles.nameWrap}>
                        <View style={styles.nameLine}>
                          <Text style={[styles.memberName, themeStyles.text]} numberOfLines={1}>
                            {member.displayName}
                          </Text>
                          {member.role === 'owner' && (
                            <View style={styles.ownerBadge}>
                              <Text style={styles.ownerBadgeText}>{t('common.owner') || 'Владелец'}</Text>
                            </View>
                          )}
                          {member.isSelf && (
                            <Text style={styles.youLabel}>{t('sellers.youLabel') || 'Вы'}</Text>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {checkInInfo && (
                            <TouchableOpacity
                              onPress={() => (navigation as any).navigate('CheckInHistory', { userId: member.userId, sellerName: member.displayName })}
                            >
                              <Text style={[styles.checkInLabel, { color: checkInInfo.color }]} numberOfLines={1}>
                                {checkInInfo.label}
                              </Text>
                            </TouchableOpacity>
                          )}
                          <Text style={[styles.memberSub, themeStyles.memberSub]} numberOfLines={1}>
                            {checkInInfo ? ' · ' : ''}{onlineLabel}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.revenueWrap}>
                      <Text style={[styles.revenueHero, themeStyles.text]} numberOfLines={1}>
                        {(memberStats?.revenue || 0).toLocaleString()} {currency.symbol}
                      </Text>
                      <Text style={[styles.revenueSub, themeStyles.memberSub]}>
                        {memberStats?.salesCount || 0} {t('home.salesCount').toLowerCase()}
                      </Text>
                    </View>
                    {!member.isSelf && (
                      <TouchableOpacity onPress={() => handleMemberActions(member)} style={{ padding: 5, marginLeft: 2 }}>
                        <Ionicons name="ellipsis-vertical" size={20} color={isDark ? '#AAA' : '#666'} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {isOwner && member.role === 'seller' && (
                    <TouchableOpacity
                      style={[styles.permSummaryRow, { borderTopColor: isDark ? '#333' : '#EEE' }]}
                      onPress={() => setPermissionsModalUserId(member.userId)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={(member.permissions?.length || 0) > 0 ? 'key' : 'key-outline'}
                        size={14}
                        color={(member.permissions?.length || 0) > 0 ? Colors.primary : (isDark ? '#777' : '#AAA')}
                      />
                      <Text
                        style={[
                          styles.permSummaryText,
                          themeStyles.memberSub,
                          (member.permissions?.length || 0) > 0 && { color: Colors.primary },
                        ]}
                        numberOfLines={1}
                      >
                        {getPermissionSummary(member)}
                      </Text>
                      <View style={{ flex: 1 }} />
                      <Ionicons name="chevron-forward" size={16} color={isDark ? '#555' : '#CCC'} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, themeStyles.memberSub]}>
        {t('sellers.managementSectionTitle') || 'Управление'}
      </Text>

      <View style={[styles.inviteCard, themeStyles.card]}>
        <Text style={[styles.inviteTitle, themeStyles.text]}>{t('sellers.inviteTitle') || 'Пригласить продавца'}</Text>
        <Text style={styles.inviteDesc}>{t('sellers.inviteDesc') || 'Поделитесь этим кодом с вашим сотрудником. Он должен ввести его при первом входе.'}</Text>

        <View style={styles.codeRow}>
          <View style={[styles.codeBox, themeStyles.codeBox]}>
            {inviteCode ? (
              <Text style={styles.codeText}>{inviteCode}</Text>
            ) : (
              <ActivityIndicator color={Colors.primary} />
            )}
          </View>
          <TouchableOpacity
            style={[styles.copyBtn, !inviteCode && { opacity: 0.5 }]}
            onPress={copyToClipboard}
            disabled={!inviteCode}
          >
            <Ionicons name="copy-outline" size={20} color="#FFF" />
            <Text style={styles.copyBtnText}>{t('common.copy') || 'Копировать'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.regenBtn, !inviteCode && { opacity: 0.5 }]}
          onPress={handleRegenerate}
          disabled={!inviteCode}
        >
          <Text style={styles.regenBtnText}>{t('sellers.regenerateBtn') || 'Перевыпустить код'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.settingsRow, themeStyles.card]}
        onPress={() => (navigation as any).navigate('CheckInSettings')}
        activeOpacity={0.7}
      >
        <View style={[styles.settingsIconWrap, { backgroundColor: Colors.primaryLight }]}>
          <Ionicons name="checkbox-outline" size={22} color={Colors.primary} />
        </View>
        <View style={styles.settingsTextWrap}>
          <Text style={[styles.settingsTitle, themeStyles.text]}>
            {t('sellers.checkInCardTitle') || 'Проверка присутствия'}
          </Text>
          <Text style={[styles.settingsDesc, themeStyles.memberSub]}>
            {t('sellers.checkInCardDesc') || 'QR-код, NFC и геолокация для отметки прихода'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={isDark ? '#666' : '#CCC'} />
      </TouchableOpacity>

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

    <Modal
      visible={!!permissionsModalUserId}
      transparent
      animationType="slide"
      onRequestClose={() => setPermissionsModalUserId(null)}
    >
      <View style={styles.permModalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setPermissionsModalUserId(null)}
        />
        {(() => {
          const activeMember = members.find(m => m.userId === permissionsModalUserId);
          if (!activeMember) return null;
          return (
            <View style={[styles.permModalSheet, themeStyles.card]}>
              <View style={styles.permModalHandle} />
              <Text style={[styles.permModalTitle, themeStyles.text]}>
                Доступы — {activeMember.displayName}
              </Text>
              <Text style={[styles.permModalSubtitle, themeStyles.memberSub]}>
                Что этот продавец может делать помимо обычных продаж
              </Text>

              {PERMISSION_DEFS.map((def) => {
                const permKey = `${activeMember.userId}:${def.key}`;
                const active = !!activeMember.permissions?.includes(def.key);
                const isToggling = togglingPermKey === permKey;
                return (
                  <View key={def.key} style={[styles.permRow, { borderTopColor: isDark ? '#2A2A2A' : '#F0F0F0' }]}>
                    <View style={[
                      styles.permIconWrap,
                      { backgroundColor: active ? Colors.primaryLight : (isDark ? '#2A2A2A' : '#F5F5F5') }
                    ]}>
                      <Ionicons name={def.icon} size={20} color={active ? Colors.primary : (isDark ? '#888' : '#999')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.permRowTitle, themeStyles.text]}>{def.title}</Text>
                      <Text style={[styles.permRowDesc, themeStyles.memberSub]}>{def.desc}</Text>
                    </View>
                    {isToggling ? (
                      <ActivityIndicator size="small" color={Colors.primary} style={{ width: 51 }} />
                    ) : (
                      <Switch
                        value={active}
                        onValueChange={() => togglePermission(activeMember, def.key)}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor="#fff"
                        disabled={!!togglingPermKey}
                      />
                    )}
                  </View>
                );
              })}

              <TouchableOpacity
                style={styles.permModalCloseBtn}
                onPress={() => setPermissionsModalUserId(null)}
              >
                <Text style={styles.permModalCloseBtnText}>Готово</Text>
              </TouchableOpacity>
            </View>
          );
        })()}
      </View>
    </Modal>
    </>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F8F9FA' },
  card: { backgroundColor: '#FFF' },
  text: { color: '#333' },
  periodBtn: { backgroundColor: '#EEE' },
  periodText: { color: '#666' },
  memberSub: { color: '#999' },
  statusOffline: { backgroundColor: '#CCC' },
  iconError: { color: '#CCC' },
  codeBox: { backgroundColor: '#F0F0F0', borderColor: '#DDD' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#121212' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
  periodBtn: { backgroundColor: '#333' },
  periodText: { color: '#AAA' },
  memberSub: { color: '#888' },
  statusOffline: { backgroundColor: '#444' },
  iconError: { color: '#555' },
  codeBox: { backgroundColor: '#2A2A2A', borderColor: '#333' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 15 },
  errorText: { fontSize: 16, marginTop: 15, marginBottom: 20, textAlign: 'center', opacity: 0.7 },
  retryBtn: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: 12 },
  retryBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  periodRow: { flexDirection: 'row', gap: 10 },
  periodBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: 13 },
  periodTextActive: { color: '#FFF', fontWeight: '600' },
  list: { paddingHorizontal: 20, gap: 12 },
  memberCard: { borderRadius: 16, ...Shadow.sm },
  memberCardInner: { flexDirection: 'row', borderRadius: 16, overflow: 'hidden' },
  memberCardContent: { flex: 1, padding: 16 },
  statusAccent: { width: 4 },
  checkInLabel: { fontSize: 12, fontWeight: '600' },
  memberInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { position: 'relative', marginRight: 15 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  statusDot: { position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFF' },
  nameWrap: { flex: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ownerBadge: { backgroundColor: Colors.infoLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  ownerBadgeText: { color: Colors.info, fontSize: 10, fontWeight: 'bold' },
  youLabel: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  memberName: { fontSize: 16, fontWeight: '600' },
  memberSub: { fontSize: 12, marginTop: 2 },
  revenueWrap: { alignItems: 'flex-end' },
  revenueHero: { fontSize: 19, fontWeight: '700' },
  revenueSub: { fontSize: 11, marginTop: 2 },
  inviteCard: { margin: 20, padding: 20, borderRadius: 16, ...Shadow.md, borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.primary },
  inviteTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  inviteDesc: { fontSize: 13, color: '#888', lineHeight: 18, marginBottom: 20 },
  codeRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  codeBox: { flex: 1, height: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
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
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 15 },
  statChip: { flex: 1, borderRadius: 12, padding: 12, ...Shadow.sm },
  statChipValue: { fontSize: 18, fontWeight: 'bold' },
  statChipLabel: { fontSize: 12, marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6, marginHorizontal: 20, marginBottom: 10, marginTop: 4 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 16, ...Shadow.md },
  settingsIconWrap: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  settingsTextWrap: { flex: 1 },
  settingsTitle: { fontSize: 15, fontWeight: '600' },
  settingsDesc: { fontSize: 12, marginTop: 2, opacity: 0.7 },
  permSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  permSummaryText: { fontSize: 13, fontWeight: '500' },
  permModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  permModalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  permModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CCC',
    alignSelf: 'center',
    marginBottom: 16,
  },
  permModalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  permModalSubtitle: { fontSize: 13, marginBottom: 8 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  permIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permRowTitle: { fontSize: 15, fontWeight: '600' },
  permRowDesc: { fontSize: 12, marginTop: 2, opacity: 0.7, lineHeight: 16 },
  permModalCloseBtn: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permModalCloseBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});
