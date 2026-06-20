import * as SecureStore from 'expo-secure-store';
import { Classified, WholesaleAd, NewsFeed, ClassifiedCategory } from '../types/ads';

const ADS_API_URL = process.env.EXPO_PUBLIC_ADS_API_URL;

class MarketService {
  private async getHeaders() {
    const token = await SecureStore.getItemAsync('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async handleResponse(response: Response) {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'API request failed');
    }
    return response.json();
  }

  // Classifieds
  async getClassifieds(city?: string, category?: ClassifiedCategory, page = 1, limit = 20): Promise<Classified[]> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    let url = `${ADS_API_URL}/api/classifieds?page=${page}&limit=${limit}`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    if (category) url += `&category=${category}`;

    const response = await fetch(url);
    return this.handleResponse(response);
  }

  async getClassifiedDetails(id: string): Promise<Classified> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    const response = await fetch(`${ADS_API_URL}/api/classifieds/${id}`);
    return this.handleResponse(response);
  }

  async createClassified(data: Partial<Classified>): Promise<Classified> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    const headers = await this.getHeaders();
    const response = await fetch(`${ADS_API_URL}/api/classifieds`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return this.handleResponse(response);
  }

  async incrementClassifiedContact(id: string): Promise<void> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    await fetch(`${ADS_API_URL}/api/classifieds/${id}/contact`, { method: 'POST' });
  }

  async deleteClassified(id: string): Promise<void> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    const headers = await this.getHeaders();
    const response = await fetch(`${ADS_API_URL}/api/classifieds/${id}`, {
      method: 'DELETE',
      headers,
    });
    await this.handleResponse(response);
  }

  // Wholesale
  async getWholesaleAds(category?: string, city?: string): Promise<WholesaleAd[]> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    let url = `${ADS_API_URL}/api/wholesale`;
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (city) params.append('city', city);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url);
    return this.handleResponse(response);
  }

  async getWholesaleAd(id: string): Promise<WholesaleAd> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    const response = await fetch(`${ADS_API_URL}/api/wholesale/${id}`);
    return this.handleResponse(response);
  }

  async incrementWholesaleCall(id: string): Promise<void> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    await fetch(`${ADS_API_URL}/api/wholesale/${id}/call`, { method: 'POST' });
  }

  async incrementWholesaleTelegram(id: string): Promise<void> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    await fetch(`${ADS_API_URL}/api/wholesale/${id}/telegram`, { method: 'POST' });
  }

  async trackWholesaleView(id: string): Promise<void> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    try {
      await fetch(`${ADS_API_URL}/api/wholesale/${id}/view`, { method: 'POST' });
    } catch (e) {
      console.warn('Failed to track view', e);
    }
  }

  // News
  async getLatestNews(): Promise<NewsFeed | null> {
    if (!ADS_API_URL) throw new Error('Ads API URL not configured');
    try {
      const response = await fetch(`${ADS_API_URL}/api/news`);
      if (response.status === 404) return null;
      return this.handleResponse(response);
    } catch (e) {
      console.warn('Failed to fetch news', e);
      return null;
    }
  }
}

export const marketService = new MarketService();
