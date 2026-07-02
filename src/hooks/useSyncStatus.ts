import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncService } from '../services/syncService';

export type SyncDotState = 'synced' | 'syncing' | 'offline';

const RECENT_SYNC_WINDOW_MS = 5 * 60 * 1000;

export function useSyncStatus(): SyncDotState {
  const [isSyncing, setIsSyncing] = useState(SyncService.getIsSyncing());
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(true);

  const refresh = useCallback(async () => {
    const [ts, enabled] = await Promise.all([
      AsyncStorage.getItem('last_sync_at'),
      AsyncStorage.getItem('sync_enabled'),
    ]);
    setLastSyncAt(ts);
    setSyncEnabled(enabled !== 'false');
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = SyncService.subscribe((syncing) => {
      setIsSyncing(syncing);
      if (!syncing) refresh();
    });
    return unsubscribe;
  }, [refresh]);

  if (!syncEnabled) return 'offline';
  if (isSyncing) return 'syncing';
  if (lastSyncAt && Date.now() - new Date(lastSyncAt).getTime() < RECENT_SYNC_WINDOW_MS) {
    return 'synced';
  }
  return 'offline';
}
