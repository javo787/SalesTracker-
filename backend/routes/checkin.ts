import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware, requireShop, requireOwner, requirePermission, AuthRequest } from '../middleware/authMiddleware';
import Shop from '../models/Shop';
import ShiftCheckIn from '../models/ShiftCheckIn';
import ShopMember from '../models/ShopMember';
import ShopAuditLog from '../models/ShopAuditLog';
import { hashNfcTagUid } from '../utils/hash';

const router = express.Router();

function localDateString(d: Date): string {
  // Tajikistan/Uzbekistan is UTC+5.
  // We add 5 hours to the UTC date to get the local date string.
  const localDate = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return localDate.toISOString().split('T')[0];
}

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

// PATCH /shop/checkin/:userId/manual-confirm — Manual confirm check-in (manage_team permission required)
router.patch('/:userId/manual-confirm', authMiddleware, requireShop, requirePermission('manage_team'), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { localDate } = req.body;

    if (!localDate || typeof localDate !== 'string') {
      return res.status(400).json({ message: 'localDate is required' });
    }

    // Restriction: only allow this for localDate within the last 7 days (reject older dates with 400 'DATE_TOO_OLD')
    const targetDate = new Date(localDate);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ message: 'Invalid localDate format' });
    }

    const todayStr = localDateString(new Date());
    const todayDate = new Date(todayStr);

    const diffMs = todayDate.getTime() - targetDate.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffDays > 7 || diffDays < 0) {
      return res.status(400).json({ code: 'DATE_TOO_OLD', message: 'Date is too old or in the future' });
    }

    const targetMember = await ShopMember.findOne({ shopId: req.shopId, userId, isActive: true });
    if (!targetMember) {
      return res.status(404).json({ message: 'Shop member not found' });
    }

    const shop = await Shop.findById(req.shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    let record = await ShiftCheckIn.findOne({
      shopId: req.shopId,
      userId,
      localDate,
    });

    const checkInSettings = shop.checkInSettings;
    const requiredMethodsCount = checkInSettings?.verificationMode === 'two_factor' ? 2 : 1;

    if (!record) {
      record = new ShiftCheckIn({
        shopId: req.shopId,
        userId,
        sellerName: targetMember.displayName,
        localDate,
        methodsUsed: [],
        status: 'confirmed',
        requiredMethodsCount,
        ownerOverride: true,
        overrideBy: new mongoose.Types.ObjectId(req.userId),
        overrideAt: new Date(),
      });
    } else {
      record.status = 'confirmed';
      record.ownerOverride = true;
      record.overrideBy = new mongoose.Types.ObjectId(req.userId);
      record.overrideAt = new Date();
    }

    await record.save();

    // Log to ShopAuditLog with action 'checkin_manual_override'
    await ShopAuditLog.create({
      shopId: req.shopId,
      actorUserId: req.userId,
      actorName: req.sellerName || 'Owner',
      action: 'checkin_manual_override',
      targetUserId: new mongoose.Types.ObjectId(userId),
      targetName: targetMember.displayName,
      metadata: { localDate },
    }).catch(e => console.error('Audit log error (checkin_manual_override):', e));

    return res.status(200).json(record);
  } catch (error) {
    console.error('Manual confirm error:', error);
    res.status(500).json({ message: 'Internal server error during manual confirmation' });
  }
});

// GET /shop/checkin/history — Get check-in history for all active shop members (manage_team permission required)
router.get('/history', authMiddleware, requireShop, requirePermission('manage_team'), async (req: AuthRequest, res) => {
  try {
    const { period = 'week', startDate } = req.query;

    const start = startDate && typeof startDate === 'string' ? new Date(startDate) : new Date();
    if (isNaN(start.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate' });
    }

    const todayStr = startDate && typeof startDate === 'string' ? startDate : localDateString(start);
    const today = new Date(todayStr);

    let fromDateStr: string;
    let datesToFill: string[] = [];

    if (period === 'week') {
      // 7 days ago including today
      const datesList: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        datesList.push(localDateString(d));
      }
      fromDateStr = datesList[0];
      datesToFill = datesList;
    } else if (period === 'month') {
      // Current month's days from day 1 to today
      const datesList: string[] = [];
      const dayCount = today.getDate();
      for (let i = dayCount - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        datesList.push(localDateString(d));
      }
      fromDateStr = todayStr.substring(0, 8) + '01';
      datesToFill = datesList;
    } else {
      return res.status(400).json({ message: 'Invalid period parameter' });
    }

    // Find active shop members with role 'seller', and the owner if they are marked as checking in
    const activeMembers = await ShopMember.find({
      shopId: req.shopId,
      isActive: true,
    }).select('userId displayName role').lean();

    // Fetch ShiftCheckIn records for this period
    const checkIns = await ShiftCheckIn.find({
      shopId: req.shopId,
      localDate: { $in: datesToFill },
    }).lean();

    // Map of ShiftCheckIn records by key "userId:localDate"
    const checkInMap = new Map<string, typeof checkIns[0]>();
    const usersWhoCheckedIn = new Set<string>();

    for (const ci of checkIns) {
      const uId = ci.userId.toString();
      checkInMap.set(`${uId}:${ci.localDate}`, ci);
      usersWhoCheckedIn.add(uId);
    }

    const finalMembersList = activeMembers.filter(member => {
      if (member.role === 'seller') return true;
      if (member.role === 'owner') {
        // Only include owner if they actually checked in at least once in this period
        return usersWhoCheckedIn.has(member.userId.toString());
      }
      return false;
    });

    const result = finalMembersList.map(member => {
      const uId = member.userId.toString();
      const days = datesToFill.map(date => {
        const record = checkInMap.get(`${uId}:${date}`);
        if (!record) {
          return {
            localDate: date,
            status: 'missing',
            methodsUsed: [],
            ownerOverride: false,
          };
        }
        return {
          localDate: date,
          status: record.status,
          methodsUsed: record.methodsUsed || [],
          ownerOverride: record.ownerOverride || false,
        };
      });

      return {
        userId: uId,
        sellerName: member.displayName,
        days,
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Check-in history error:', error);
    res.status(500).json({ message: 'Internal server error fetching check-in history' });
  }
});

export default router;
