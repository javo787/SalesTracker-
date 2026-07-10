import { api } from './api';
import { insertPendingCheckIn, nowLocalISO, todayLocalDate } from '../db/database';

export async function submitCheckIn(
  method: 'gps' | 'nfc' | 'qr',
  payload: {
    gps?: { latitude: number; longitude: number };
    nfcTagUid?: string;
    qrToken?: string;
  }
) {
  const localDate = todayLocalDate();

  try {
    const res = await api.post<any>('/shop/checkin', {
      method,
      localDate,
      ...payload,
    });

    // On direct success, write as synced=1 and status from response
    insertPendingCheckIn({
      local_date: localDate,
      method,
      gps_lat: payload.gps?.latitude ?? null,
      gps_lng: payload.gps?.longitude ?? null,
      nfc_tag_uid: payload.nfcTagUid ?? null,
      qr_token: payload.qrToken ?? null,
      created_at: nowLocalISO(),
      synced: 1,
      server_status: res.status, // 'confirmed' or 'partial'
    });

    return res;
  } catch (err: any) {
    if (err.status >= 400 && err.status < 500) {
      // 400 validation/mismatch error. This is a definitive response from the server (rejected).
      insertPendingCheckIn({
        local_date: localDate,
        method,
        gps_lat: payload.gps?.latitude ?? null,
        gps_lng: payload.gps?.longitude ?? null,
        nfc_tag_uid: payload.nfcTagUid ?? null,
        qr_token: payload.qrToken ?? null,
        created_at: nowLocalISO(),
        synced: 1, // synced=1 because server handled and gave final answer
        server_status: 'rejected',
        server_error: err.code || err.message || 'Validation error',
      });
      throw err;
    } else {
      // Network failure or 500 internal server error.
      // Save locally as 'pending' with synced=0 so it gets retried via sync queue.
      insertPendingCheckIn({
        local_date: localDate,
        method,
        gps_lat: payload.gps?.latitude ?? null,
        gps_lng: payload.gps?.longitude ?? null,
        nfc_tag_uid: payload.nfcTagUid ?? null,
        qr_token: payload.qrToken ?? null,
        created_at: nowLocalISO(),
        synced: 0,
        server_status: 'pending',
      });
      throw err;
    }
  }
}
