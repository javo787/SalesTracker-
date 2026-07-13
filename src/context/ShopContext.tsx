import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getShopSession, saveShopSession, clearShopSession } from '../db/database';
import { api } from '../services/api';
import { SyncService } from '../services/syncService';

export type ShopRole = 'owner' | 'seller';

export interface CheckInStatus {
  enabled: boolean;
  verificationMode: 'any' | 'two_factor';
  methods: { gps: boolean; nfc: boolean; qr: boolean };
}

interface ShopContextType {
  shopId: string | null;
  shopName: string | null;
  role: ShopRole | null;
  sellerName: string | null;
  inviteCode: string | null;
  isOwner: boolean;
  isSeller: boolean;
  hasShop: boolean;
  isLoading: boolean;
  shopRevoked: boolean;
  setShopRevoked: (val: boolean) => void;
  checkInStatus: CheckInStatus;
  createShop(shopName: string): Promise<void>;
  joinShop(inviteCode: string): Promise<void>;
  leaveShop(): Promise<{ ok: true } | { ok: false; code: 'TRANSFER_REQUIRED' }>;
  transferOwnership(userId: string): Promise<void>;
  refreshShopInfo(): Promise<void>;
  regenerateInviteCode(): Promise<string>;
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [role, setRole] = useState<ShopRole | null>(null);
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shopRevoked, setShopRevoked] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus>({
    enabled: false,
    verificationMode: 'any',
    methods: { gps: false, nfc: false, qr: false },
  });

  useEffect(() => {
    loadFromLocal();

    const unsubscribe = api.onShopRevoked(() => {
      clearShopSession();
      setShopId(null); setShopName(null); setRole(null);
      setSellerName(null); setInviteCode(null);
      setShopRevoked(true);
    });

    return () => unsubscribe();
  }, []);

  const loadFromLocal = async () => {
    // First read from SQLite (offline-friendly)
    const session = getShopSession();
    if (session.shopId) {
      setShopId(session.shopId);
      setShopName(session.shopName);
      setRole(session.role);
      setSellerName(session.sellerName);
      setInviteCode(session.inviteCode);
    }
    try {
      const cachedStatus = await AsyncStorage.getItem('shop_checkin_status');
      if (cachedStatus) {
        setCheckInStatus(JSON.parse(cachedStatus));
      }
    } catch (e) {
      console.warn('Failed to parse cached checkInStatus:', e);
    }
    setIsLoading(false);
  };

  const persistSession = (data: {
    shopId: string; shopName: string; role: ShopRole;
    sellerName: string; inviteCode?: string;
  }) => {
    setShopId(data.shopId);
    setShopName(data.shopName);
    setRole(data.role);
    setSellerName(data.sellerName);
    setInviteCode(data.inviteCode || null);
    saveShopSession(data);
  };

  const createShop = async (name: string) => {
    try {
      const result = await api.post<{
        shopId: string; shopName: string; role: ShopRole; inviteCode: string;
      }>('/shop/create', { shopName: name });

      // Fix Bug 1: Use actual user name from storage
      const storedUser = await AsyncStorage.getItem('auth_user');
      const userName = storedUser ? JSON.parse(storedUser).name : result.shopName;

      persistSession({ ...result, sellerName: userName });

      try {
        await SyncService.pull();
      } catch (pullErr) {
        console.warn('Initial pull after createShop failed:', pullErr);
      }
    } catch (e: any) {
      throw e;
    }
  };

  const joinShop = async (code: string) => {
    try {
      const result = await api.post<{
        shopId: string; shopName: string; role: ShopRole;
      }>('/shop/join', { inviteCode: code });

      // Fix Bug 4: Use actual user name from storage
      const storedUser = await AsyncStorage.getItem('auth_user');
      const userName = storedUser ? JSON.parse(storedUser).name : 'Продавец';

      persistSession({ ...result, sellerName: userName });

      try {
        await SyncService.pull();
      } catch (pullErr) {
        console.warn('Initial pull after joinShop failed:', pullErr);
      }
    } catch (e: any) {
      throw e;
    }
  };

  const refreshShopInfo = async () => {
    try {
      const result = await api.get<{
        shopId: string;
        shopName: string;
        role: ShopRole;
        inviteCode?: string;
        checkInStatus?: CheckInStatus;
      }>('/shop/info');

      if (result.checkInStatus) {
        setCheckInStatus(result.checkInStatus);
        await AsyncStorage.setItem('shop_checkin_status', JSON.stringify(result.checkInStatus));
      }

      persistSession({
        shopId: result.shopId,
        shopName: result.shopName,
        role: result.role,
        sellerName: sellerName || '',
        inviteCode: result.inviteCode,
      });
    } catch {
      // Offline — use cache
    }
  };

  const regenerateInviteCode = async () => {
    const { inviteCode: newCode } = await api.post<{ inviteCode: string }>('/shop/regenerate-code', {});
    setInviteCode(newCode);
    if (shopId && shopName && role && sellerName) {
      saveShopSession({ shopId, shopName, role, sellerName, inviteCode: newCode });
    }
    return newCode;
  };

  const transferOwnership = async (userId: string) => {
    await api.patch(`/shop/members/${userId}/role`, { action: 'transfer_ownership' });
    setRole('seller');
    if (shopId && shopName && sellerName) {
      saveShopSession({ shopId, shopName, role: 'seller', sellerName, inviteCode: inviteCode || undefined });
    }
  };

  const leaveShop = async (): Promise<{ ok: true } | { ok: false; code: 'TRANSFER_REQUIRED' }> => {
    try {
      await api.post('/shop/leave', {});
      clearShopSession();
      setShopId(null); setShopName(null); setRole(null);
      setSellerName(null); setInviteCode(null);
      return { ok: true };
    } catch (e: any) {
      if (e.message?.includes('TRANSFER_REQUIRED') || e.status === 409) {
        return { ok: false, code: 'TRANSFER_REQUIRED' };
      }
      throw e;
    }
  };

  return (
    <ShopContext.Provider value={{
      shopId, shopName, role, sellerName, inviteCode,
      isOwner: role === 'owner',
      isSeller: role === 'seller',
      hasShop: !!shopId,
      isLoading,
      shopRevoked,
      setShopRevoked,
      checkInStatus,
      createShop, joinShop, leaveShop, transferOwnership, refreshShopInfo, regenerateInviteCode,
    }}>
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = () => {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used within ShopProvider');
  return ctx;
};
