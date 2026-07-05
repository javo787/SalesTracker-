import * as SecureStore from 'expo-secure-store';
import { clearShopSession } from '../db/database';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type RevokedCallback = () => void;

class ApiClient {
  private revokedCallbacks: RevokedCallback[] = [];

  onShopRevoked(callback: RevokedCallback) {
    this.revokedCallbacks.push(callback);
    return () => {
      this.revokedCallbacks = this.revokedCallbacks.filter(cb => cb !== callback);
    };
  }

  private emitRevoked() {
    this.revokedCallbacks.forEach(cb => cb());
  }

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
    if (response.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      throw new Error('Unauthorized');
    }
    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.message?.includes('Not a member of any shop')) {
        this.emitRevoked();
        clearShopSession();
        throw new Error('SHOP_ACCESS_REVOKED');
      }
      // Other 403 (e.g. requireOwner on seller request)
      throw new Error(errorData.message || 'Forbidden');
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error: any = new Error(errorData.message || `Request failed (HTTP ${response.status})`);
      error.status = response.status;
      error.code = errorData.code;
      throw error;
    }
    return response.json();
  }

  async get<T>(path: string): Promise<T> {
    if (!API_URL) throw new Error('API URL not configured');
    const headers = await this.getHeaders();
    const response = await fetch(`${API_URL}${path}`, {
      method: 'GET',
      headers,
    });
    return this.handleResponse(response);
  }

  async post<T>(path: string, body: any): Promise<T> {
    if (!API_URL) throw new Error('API URL not configured');
    const headers = await this.getHeaders();
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse(response);
  }

  async patch<T>(path: string, body: any): Promise<T> {
    if (!API_URL) throw new Error('API URL not configured');
    const headers = await this.getHeaders();
    const response = await fetch(`${API_URL}${path}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse(response);
  }

  async delete<T>(path: string): Promise<T> {
    if (!API_URL) throw new Error('API URL not configured');
    const headers = await this.getHeaders();
    const response = await fetch(`${API_URL}${path}`, {
      method: 'DELETE',
      headers,
    });
    return this.handleResponse(response);
  }
}

export const api = new ApiClient();
