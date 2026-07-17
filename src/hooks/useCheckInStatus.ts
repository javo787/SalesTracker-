import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useShop } from '../context/ShopContext';
import { getTodayCheckInLocal, updateCheckInSyncResult, todayLocalDate, LocalCheckIn } from '../db/database';
import { api } from '../services/api';
import { submitCheckIn as submitCheckInService } from '../services/checkInService';

export function useCheckInStatus() {
  const { checkInStatus, hasShop, isOwner } = useShop();
  const [todayStatus, setTodayStatus] = useState<LocalCheckIn['server_status'] | null>(null);
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadLocalStatus = useCallback(() => {
    const local = getTodayCheckInLocal();
    if (local) {
      setTodayStatus(local.server_status);
      setTodayRecord({
        status: local.server_status,
        methodsUsed: [
          // Build a simulated Mongoose style methodsUsed array from the local DB row
          { method: local.method, at: new Date(local.created_at) }
        ],
      });
    } else {
      setTodayStatus(null);
      setTodayRecord(null);
    }
  }, []);

  const reconcileWithServer = useCallback(async () => {
    // Presence check-in is seller-only; the owner is exempt, so skip the
    // network round-trip (and the ShiftCheckIn lookup on the backend) entirely.
    if (!hasShop || !checkInStatus.enabled || isOwner) return;
    try {
      const today = todayLocalDate();
      const serverRecord = await api.get<any>(`/shop/checkin/today?localDate=${today}`);
      if (serverRecord) {
        // Update local DB to match server's status and clear any old error
        updateCheckInSyncResult(serverRecord.status, null, 1);
        setTodayStatus(serverRecord.status);
        setTodayRecord(serverRecord);
      }
    } catch (err: any) {
      // 404 is expected if they haven't checked in yet, ignore other errors silently
      if (err.status !== 404) {
        console.warn('Failed to reconcile check-in status:', err);
      }
    }
  }, [hasShop, checkInStatus.enabled, isOwner]);

  useEffect(() => {
    loadLocalStatus();
    reconcileWithServer();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        loadLocalStatus();
        reconcileWithServer();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [loadLocalStatus, reconcileWithServer]);

  const submitCheckIn = async (method: 'gps' | 'nfc' | 'qr', payload: any) => {
    setLoading(true);
    try {
      const res = await submitCheckInService(method, payload);
      loadLocalStatus();
      return res;
    } catch (err) {
      loadLocalStatus();
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    checkInStatus,
    todayStatus,
    todayRecord,
    loading,
    submitCheckIn,
    refreshStatus: () => {
      loadLocalStatus();
      reconcileWithServer();
    },
  };
}
