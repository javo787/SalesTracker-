import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

class ApiClient {
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
      // Potential for logout event dispatch
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Request failed (HTTP ${response.status})`);
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
}

export const api = new ApiClient();
