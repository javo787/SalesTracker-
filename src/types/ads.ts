export interface Classified {
  _id: string;
  userId: string;
  userName: string;
  userPhone?: string;
  title: string;
  description: string;
  category: ClassifiedCategory;
  city: string;
  market?: string;
  images: string[];
  price?: number;
  currency: 'TJS' | 'UZS';
  isActive: boolean;
  isPinned: boolean;
  views: number;
  contactViews: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  moderationStatus: 'pending' | 'approved' | 'rejected';
  moderationNote?: string;
}

export type ClassifiedCategory =
  | 'rent_spot'
  | 'rent_shop'
  | 'hire_seller'
  | 'looking_for_job'
  | 'sell_equipment'
  | 'buy_equipment'
  | 'partnership'
  | 'other';

export interface WholesaleAd {
  _id: string;
  companyName: string;
  contactPhone: string;
  contactTelegram?: string;
  description: string;
  categories: string[];
  cities: string[];
  images: string[];
  minOrderAmount?: number;
  currency: string;
  priceRange?: string;
  priority: number;
  tier: 'basic' | 'premium' | 'vip';
  isActive: boolean;
  isPaid: boolean;
  paidUntil: string;
  views: number;
  clicks: number;
  calls: number;
  telegramClicks: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewsArticle {
  title_ru: string;
  title_tg: string;
  title_uz: string;
  summary_ru: string;
  summary_tg: string;
  summary_uz: string;
  url: string;
  source: string;
  category: 'customs' | 'currency' | 'logistics' | 'construction_materials' | 'textile' | 'fuel' | 'general';
  relevanceScore: number;
}

export interface NewsFeed {
  _id: string;
  date: string;
  articles: NewsArticle[];
  generatedAt: string;
}
