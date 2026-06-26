import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getShopSession, saveShopSession, clearShopSession } from '../db/database';
import { api } from '../services/api';

export type ShopRole = 'owner' | 'seller';

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
  createShop(shopName: string): Promise<void>;
  joinShop(inviteCode: string): Promise<void>;
  leaveShop(): Promise<void>;
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

  useEffect(() => {
    loadFromLocal();
  }, []);

  const loadFromLocal = () => {
    // First read from SQLite (offline-friendly)
    const session = getShopSession();
    if (session.shopId) {
      setShopId(session.shopId);
      setShopName(session.shopName);
      setRole(session.role);
      setSellerName(session.sellerName);
      setInviteCode(session.inviteCode);
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
    const result = await api.post<{
      shopId: string; shopName: string; role: ShopRole; inviteCode: string;
    }>('/shop/create', { shopName: name });
    persistSession({ ...result, sellerName: result.shopName });
  };

  const joinShop = async (code: string) => {
    const result = await api.post<{
      shopId: string; shopName: string; role: ShopRole;
    }>('/shop/join', { inviteCode: code });
    const user = await AsyncStorage.getItem('user_name') || 'Продавец';
    persistSession({ ...result, sellerName: user });
  };

  const refreshShopInfo = async () => {
    try {
      const result = await api.get<{
        shopId: string; shopName: string; role: ShopRole; inviteCode?: string;
      }>('/shop/info');
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

  const leaveShop = async () => {
    clearShopSession();
    setShopId(null); setShopName(null); setRole(null);
    setSellerName(null); setInviteCode(null);
  };

  return (
    <ShopContext.Provider value={{
      shopId, shopName, role, sellerName, inviteCode,
      isOwner: role === 'owner',
      isSeller: role === 'seller',
      hasShop: !!shopId,
      isLoading,
      createShop, joinShop, leaveShop, refreshShopInfo, regenerateInviteCode,
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
