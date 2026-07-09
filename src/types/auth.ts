export interface User {
  _id: string;
  authProvider: 'google' | 'email' | 'telegram' | 'anonymous';
  email?: string;
  name: string;
  avatarUrl?: string;
  referralCode: string;
  referralCount: number;
  referredBy?: string;
  createdAt: string;
  lastSyncAt: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface ProfileStats {
  totalRevenue: number;
  totalProfit: number;
  totalSales: number;
  bestProduct: { name: string; profit: number } | null;
  memberSince: string;
}

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface ShopInfo {
  shopId: string;
  shopName: string;
  role: 'owner' | 'seller';
  inviteCode?: string;
}

export interface SellerStats {
  _id: string;
  sellerName: string;
  revenue: number;
  salesCount: number;
  profit: number;
  todayRevenue?: number;
  todaySalesCount?: number;
}

export interface ShopMember {
  userId: string;
  displayName: string;
  role: 'owner' | 'seller';
  isActive: boolean;
  joinedAt: string;
  lastActiveAt: string;
  lastSyncAt?: string;
  isSelf?: boolean;
  todayRevenue?: number;
  todaySalesCount?: number;
}
