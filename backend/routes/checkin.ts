import express from 'express';
import { authMiddleware, requireShop, AuthRequest } from '../middleware/authMiddleware';
import Shop from '../models/Shop';
import ShiftCheckIn from '../models/ShiftCheckIn';
import { hashNfcTagUid } from '../utils/hash';

const router = express.Router();

// Helper to compute haversine distance in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// POST /shop/checkin — Check in using GPS, NFC, or QR
router.post('/', authMiddleware, requireShop, async (req: AuthRequest, res) => {
  try {
    const { method, localDate, gps, nfcTagUid, qrToken } = req.body;

    if (!method || !['gps', 'nfc', 'qr'].includes(method)) {
      return res.status(400).json({ message: 'Invalid or missing check-in method' });
    }

    if (!localDate || typeof localDate !== 'string') {
      return res.status(400).json({ message: 'localDate is required' });
    }

    const shop = await Shop.findById(req.shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const checkInSettings = shop.checkInSettings;
    if (!checkInSettings || !checkInSettings.enabled) {
      return res.status(400).json({ code: 'METHOD_NOT_ENABLED', message: 'Check-in is not enabled for this shop' });
    }

    let calculatedDistance: number | undefined;

    // 1. Validate check-in method server-side
    if (method === 'gps') {
      if (!checkInSettings.gps || !checkInSettings.gps.enabled) {
        return res.status(400).json({ code: 'METHOD_NOT_ENABLED', message: 'GPS check-in is not enabled' });
      }
      if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
        return res.status(400).json({ message: 'GPS coordinates are required' });
      }
      if (checkInSettings.gps.latitude === null || checkInSettings.gps.longitude === null) {
        return res.status(400).json({ code: 'GPS_NOT_CONFIGURED', message: 'Shop GPS position is not configured' });
      }

      calculatedDistance = haversineDistance(
        gps.latitude,
        gps.longitude,
        checkInSettings.gps.latitude,
        checkInSettings.gps.longitude
      );

      if (calculatedDistance > checkInSettings.gps.radiusMeters) {
        return res.status(400).json({
          code: 'OUT_OF_RANGE',
          message: `You are too far from the shop (${Math.round(calculatedDistance)} meters)`,
          distance: calculatedDistance,
        });
      }
    } else if (method === 'nfc') {
      if (!checkInSettings.nfc || !checkInSettings.nfc.enabled) {
        return res.status(400).json({ code: 'METHOD_NOT_ENABLED', message: 'NFC check-in is not enabled' });
      }
      if (!nfcTagUid || typeof nfcTagUid !== 'string') {
        return res.status(400).json({ message: 'NFC Tag UID is required' });
      }
      if (!checkInSettings.nfc.tagUidHash) {
        return res.status(400).json({ code: 'NFC_NOT_CONFIGURED', message: 'Shop NFC tag is not configured' });
      }

      const submittedHash = hashNfcTagUid(nfcTagUid);
      if (submittedHash !== checkInSettings.nfc.tagUidHash) {
        return res.status(400).json({ code: 'NFC_MISMATCH', message: 'NFC tag mismatch' });
      }
    } else if (method === 'qr') {
      if (!checkInSettings.qr || !checkInSettings.qr.enabled) {
        return res.status(400).json({ code: 'METHOD_NOT_ENABLED', message: 'QR check-in is not enabled' });
      }
      if (!qrToken || typeof qrToken !== 'string') {
        return res.status(400).json({ message: 'QR token is required' });
      }
      if (!checkInSettings.qr.currentToken) {
        return res.status(400).json({ code: 'QR_NOT_CONFIGURED', message: 'Shop QR token is not configured' });
      }

      if (qrToken !== checkInSettings.qr.currentToken) {
        return res.status(400).json({ code: 'QR_MISMATCH', message: 'QR token mismatch' });
      }
    }

    // 2. Load or Upsert today's ShiftCheckIn record
    const thisMethod = {
      method: method as 'gps' | 'nfc' | 'qr',
      at: new Date(),
      ...(method === 'gps' ? { gpsDistanceMeters: calculatedDistance } : {}),
    };

    let record = await ShiftCheckIn.findOne({
      shopId: req.shopId,
      userId: req.userId,
      localDate,
    });

    if (!record) {
      const requiredMethodsCount = checkInSettings.verificationMode === 'two_factor' ? 2 : 1;
      const status = requiredMethodsCount === 1 ? 'confirmed' : 'partial';

      record = new ShiftCheckIn({
        shopId: req.shopId,
        userId: req.userId,
        sellerName: req.sellerName || 'Seller',
        localDate,
        methodsUsed: [thisMethod],
        status,
        requiredMethodsCount,
        ownerOverride: false,
      });
      await record.save();
    } else {
      if (record.status === 'confirmed') {
        // Return existing confirmed record as-is (idempotent)
        return res.status(200).json(record);
      }

      if (record.status === 'partial') {
        // Reject same-method resubmission
        const alreadyUsed = record.methodsUsed.some(m => m.method === method);
        if (alreadyUsed) {
          return res.status(400).json({
            code: 'METHOD_ALREADY_USED',
            message: 'This check-in method has already been used today',
          });
        }

        record.methodsUsed.push(thisMethod);
        if (record.methodsUsed.length >= record.requiredMethodsCount) {
          record.status = 'confirmed';
        }
        await record.save();
      }
    }

    return res.status(200).json(record);
  } catch (error) {
    console.error('Check-in endpoint error:', error);
    res.status(500).json({ message: 'Internal server error during check-in' });
  }
});

// GET /shop/checkin/today — Get current user's check-in record for today
router.get('/today', authMiddleware, requireShop, async (req: AuthRequest, res) => {
  try {
    const { localDate } = req.query;
    if (!localDate || typeof localDate !== 'string') {
      return res.status(400).json({ message: 'localDate query parameter is required' });
    }

    const record = await ShiftCheckIn.findOne({
      shopId: req.shopId,
      userId: req.userId,
      localDate,
    });

    if (!record) {
      return res.status(404).json({ message: 'No check-in record found for today' });
    }

    return res.status(200).json(record);
  } catch (error) {
    console.error('Fetch check-in today error:', error);
    res.status(500).json({ message: 'Error fetching today check-in record' });
  }
});

export default router;
