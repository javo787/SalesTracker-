import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Platform,
} from 'react-native';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItemList,
} from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { useShop } from '../context/ShopContext';
import AdFreeButton from './ads/AdFreeButton';
import SyncDot from './SyncDot';

function Divider() {
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  return (
    <View
      style={{
        height: 1,
        backgroundColor: isDark ? '#333' : '#EEE',
        marginVertical: 8,
      }}
    />
  );
}

export default function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { user, logout, isGuest } = useAuth();
  const { role, shopName, sellerName, isOwner } = useShop();

  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#121212' : '#fff' }}>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
        {/* Header with User Info */}
        <View style={[styles.header, themeStyles.header]}>
          <TouchableOpacity
            onPress={() => props.navigation.navigate('Profile')}
            style={styles.profileClickable}
          >
            <View style={styles.avatarWrapper}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={30} color="#fff" />
                </View>
              )}
              <View style={styles.syncDotBadge}>
                <SyncDot size={14} borderColor={isDark ? '#1E1E1E' : '#F8F9FA'} />
              </View>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, themeStyles.text]} numberOfLines={1}>
                {user?.name || sellerName || t('common.guest')}
              </Text>
              <Text style={[styles.shopName, themeStyles.textSecondary]} numberOfLines={1}>
                {shopName || ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={[styles.roleBadge, { backgroundColor: isOwner ? '#5856D6' : '#34C759' }]}>
                  <Text style={styles.badgeText}>
                    {isOwner ? t('common.owner') : t('common.seller')}
                  </Text>
                </View>
                <View style={[styles.providerBadge, { backgroundColor: isGuest ? '#888' : '#1D9E75' }]}>
                  <Text style={styles.providerText}>
                    {user?.authProvider === 'google' ? 'Google' :
                    user?.authProvider === 'telegram' ? 'Telegram' :
                    user?.authProvider === 'email' ? 'Email' : t('common.guest')}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.drawerItemsContainer}>
          <DrawerItemList {...props} />
        </View>
      </DrawerContentScrollView>

      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <AdFreeButton />
      </View>
      <Divider />

      {/* Logout Button */}
      <View style={[styles.footer, themeStyles.footer]}>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={22} color="#E53935" />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const lightStyles = StyleSheet.create({
  header: { backgroundColor: '#F8F9FA', borderBottomColor: '#EEE' },
  text: { color: '#333' },
  textSecondary: { color: '#777' },
  footer: { borderTopColor: '#EEE' },
});

const darkStyles = StyleSheet.create({
  header: { backgroundColor: '#1E1E1E', borderBottomColor: '#333' },
  text: { color: '#EEE' },
  textSecondary: { color: '#999' },
  footer: { borderTopColor: '#333' },
});

const styles = StyleSheet.create({
  header: {
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    borderBottomWidth: 1,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  profileClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    width: 60,
    height: 60,
    position: 'relative',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarPlaceholder: {
    backgroundColor: '#1D9E75',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncDotBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  shopName: {
    fontSize: 14,
    marginBottom: 4,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  providerBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  providerText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  drawerItemsContainer: {
    flex: 1,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoutText: {
    color: '#E53935',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
