import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export interface CheckInSettings {
  enabled: boolean;
  verificationMode: 'any' | 'two_factor';
  gps: {
    enabled: boolean;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
  };
  nfc: {
    enabled: boolean;
    registeredAt: string | null;
    nfcRegistered: boolean;
  };
  qr: {
    enabled: boolean;
    currentToken: string | null;
    rotation: 'static' | 'daily';
    tokenGeneratedAt: string | null;
  };
}

export function useCheckInSettings() {
  const [settings, setSettings] = useState<CheckInSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.get<CheckInSettings>('/shop/checkin-settings');
      setSettings(data);
    } catch (err: any) {
      console.error('Failed to fetch check-in settings:', err);
      setError(err.message || 'Failed to fetch check-in settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (partial: any) => {
    try {
      setError(null);
      const data = await api.patch<CheckInSettings & { warning?: string }>('/shop/checkin-settings', partial);
      setSettings(data);
      return data;
    } catch (err: any) {
      console.error('Failed to update check-in settings:', err);
      setError(err.message || 'Failed to update check-in settings');
      throw err;
    }
  }, []);

  const registerNfcTag = useCallback(async (tagUid: string) => {
    try {
      setError(null);
      const result = await api.post<{ registered: boolean }>('/shop/checkin-settings/nfc/register', { tagUid });
      await fetchSettings();
      return result;
    } catch (err: any) {
      console.error('Failed to register NFC tag:', err);
      setError(err.message || 'Failed to register NFC tag');
      throw err;
    }
  }, [fetchSettings]);

  const rotateQrToken = useCallback(async () => {
    try {
      setError(null);
      const result = await api.post<{ token: string }>('/shop/checkin-settings/qr/rotate', {});
      setSettings((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          qr: {
            ...prev.qr,
            currentToken: result.token,
            tokenGeneratedAt: new Date().toISOString(),
          },
        };
      });
      return result.token;
    } catch (err: any) {
      console.error('Failed to rotate QR token:', err);
      setError(err.message || 'Failed to rotate QR token');
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    registerNfcTag,
    rotateQrToken,
    refreshSettings: fetchSettings,
  };
}
