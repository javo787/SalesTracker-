import express from 'express';
import Shop from '../models/Shop';
import ShopMember from '../models/ShopMember';
import Sale from '../models/Sale';
import User from '../models/User';
import { authMiddleware, requireShop, requireOwner, AuthRequest } from '../middleware/authMiddleware';
import mongoose from 'mongoose';

const router = express.Router();

function localDateString(d: Date): string {
  // Tajikistan/Uzbekistan is UTC+5.
  // We add 5 hours to the UTC date to get the local date string.
  const localDate = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return localDate.toISOString().split('T')[0];
}

// Generate unique invite code
async function generateInviteCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed O,0,I,1 for visual clarity
  let code: string;
  let attempts = 0;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const exists = await Shop.findOne({ inviteCode: code });
    if (!exists) break;
    attempts++;
  } while (attempts < 10);
  return code!;
}

// POST /shop/create — owner creates a shop
router.post('/create', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const existing = await ShopMember.findOne({ userId: req.userId });
    if (existing) return res.status(409).json({ message: 'Already a member of a shop' });

    const { shopName } = req.body;
    if (!shopName?.trim()) return res.status(400).json({ message: 'Shop name is required' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const inviteCode = await generateInviteCode();

    const shop = await Shop.create({
      name: shopName.trim(),
      ownerId: req.userId,
      inviteCode,
    });

    await ShopMember.create({
      shopId: shop._id,
      userId: req.userId,
      role: 'owner',
      displayName: user.name,
    });

    res.status(201).json({
      shopId: shop._id,
      shopName: shop.name,
      inviteCode: shop.inviteCode,
      role: 'owner',
    });
  } catch (error) {
    console.error('Create shop error:', error);
    res.status(500).json({ message: 'Error creating shop' });
  }
});

// POST /shop/join — seller joins via invite code
router.post('/join', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const existing = await ShopMember.findOne({ userId: req.userId });
    if (existing) return res.status(409).json({ message: 'Already a member of a shop' });

    const { inviteCode } = req.body;
    if (!inviteCode?.trim()) return res.status(400).json({ message: 'Invite code is required' });

    const shop = await Shop.findOne({ inviteCode: inviteCode.toUpperCase().trim(), isActive: true });
    if (!shop) return res.status(404).json({ message: 'Invalid or expired invite code' });

    if (shop.inviteCodeExpiresAt && shop.inviteCodeExpiresAt < new Date()) {
      return res.status(410).json({ message: 'Invite code has expired. Ask the owner for a new one.' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await ShopMember.create({
      shopId: shop._id,
      userId: req.userId,
      role: 'seller',
      displayName: user.name,
    });

    res.status(200).json({
      shopId: shop._id,
      shopName: shop.name,
      role: 'seller',
    });
  } catch (error) {
    console.error('Join shop error:', error);
    res.status(500).json({ message: 'Error joining shop' });
  }
});

// GET /shop/info — current shop info and role
router.get('/info', authMiddleware, requireShop, async (req: AuthRequest, res) => {
  try {
    const shop = await Shop.findById(req.shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const responseData: any = {
      shopId: shop._id,
      shopName: shop.name,
      role: req.role,
    };

    if (req.role === 'owner') {
      responseData.inviteCode = shop.inviteCode;
    }

    res.json(responseData);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching shop info' });
  }
});

// GET /shop/members — list of sellers (owner only)
router.get('/members', authMiddleware, requireShop, requireOwner, async (req: AuthRequest, res) => {
  try {
    const members = await ShopMember.find({ shopId: req.shopId })
      .select('userId displayName role isActive joinedAt lastActiveAt')
      .populate('userId', 'lastSyncAt')
      .lean();

    const todayStr = localDateString(new Date());

    const stats = await Sale.aggregate([
      {
        $match: {
          shopId: new mongoose.Types.ObjectId(req.shopId),
          created_at: { $gte: todayStr },
        },
      },
      {
        $group: {
          _id: '$sellerId',
          todayRevenue: { $sum: { $multiply: ['$sell_price', '$quantity'] } },
          todaySalesCount: { $sum: 1 },
        },
      },
    ]);

    const statsMap = new Map(stats.map(s => [s._id ? s._id.toString() : '', s]));

    const mappedMembers = members.map((m: any) => {
      const stringId = m.userId && m.userId._id ? m.userId._id.toString() : String(m.userId);
      const s = statsMap.get(stringId);
      const lastSyncAt = m.userId && typeof m.userId === 'object' ? m.userId.lastSyncAt : null;
      return {
        userId: stringId,
        displayName: m.displayName,
        role: m.role,
        isActive: m.isActive,
        joinedAt: m.joinedAt,
        lastActiveAt: m.lastActiveAt,
        lastSyncAt: lastSyncAt ? lastSyncAt.toISOString ? lastSyncAt.toISOString() : String(lastSyncAt) : null,
        isSelf: stringId === req.userId,
        todayRevenue: s?.todayRevenue || 0,
        todaySalesCount: s?.todaySalesCount || 0,
      };
    });

    res.json(mappedMembers);
  } catch (error) {
    console.error('Fetch members error:', error);
    res.status(500).json({ message: 'Error fetching members' });
  }
});

// PATCH /shop/members/:userId/role — update member role (owner only)
router.patch('/members/:userId/role', authMiddleware, requireShop, requireOwner, async (req: AuthRequest, res) => {
  const session = await mongoose.startSession();
  try {
    const { userId } = req.params;
    const { action } = req.body;

    if (userId === req.userId) return res.status(400).json({ message: 'Cannot transfer ownership to yourself' });

    if (action !== 'transfer_ownership') return res.status(400).json({ message: 'Invalid action' });

    const targetMember = await ShopMember.findOne({ shopId: req.shopId, userId, isActive: true });
    if (!targetMember) return res.status(404).json({ message: 'Active member not found' });
    if (targetMember.role === 'owner') return res.status(400).json({ message: 'Target is already an owner' });

    await session.withTransaction(async () => {
      // 1. Promote target
      targetMember.role = 'owner';
      await targetMember.save({ session });

      // 2. Demote current owner
      await ShopMember.updateOne(
        { shopId: req.shopId, userId: req.userId, isActive: true },
        { role: 'seller' },
        { session }
      );

      // 3. Update shop ownerId
      await Shop.findByIdAndUpdate(req.shopId, { ownerId: userId }, { session });
    });

    res.json({
      message: 'Ownership transferred successfully',
      newOwnerId: userId,
      previousOwnerNewRole: 'seller'
    });
  } catch (error) {
    console.error('Transfer ownership error:', error);
    res.status(500).json({ message: 'Error transferring ownership' });
  } finally {
    session.endSession();
  }
});

// POST /shop/leave — leave current shop
router.post('/leave', authMiddleware, requireShop, async (req: AuthRequest, res) => {
  try {
    const member = await ShopMember.findOne({ shopId: req.shopId, userId: req.userId, isActive: true });
    if (!member) return res.status(404).json({ message: 'Member not found' });

    const activeCount = await ShopMember.countDocuments({ shopId: req.shopId, isActive: true });

    if (member.role === 'owner') {
      if (activeCount > 1) {
        return res.status(409).json({
          code: 'TRANSFER_REQUIRED',
          message: 'Please assign a new owner before leaving the shop'
        });
      } else {
        // Last owner leaving — archive shop
        member.isActive = false;
        await member.save();
        await Shop.findByIdAndUpdate(req.shopId, { isActive: false });
        return res.json({ message: 'Shop archived' });
      }
    }

    // Regular seller leaving
    member.isActive = false;
    await member.save();
    res.json({ message: 'You have left the shop' });
  } catch (error) {
    console.error('Leave shop error:', error);
    res.status(500).json({ message: 'Error leaving shop' });
  }
});

// DELETE /shop/members/:userId — deactivate seller (owner only)
router.delete('/members/:userId', authMiddleware, requireShop, requireOwner, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.userId) return res.status(400).json({ message: 'Cannot remove yourself' });

    const member = await ShopMember.findOne({ shopId: req.shopId, userId });
    if (!member) return res.status(404).json({ message: 'Member not found' });

    member.isActive = false;
    await member.save();

    res.json({ message: 'Member deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error removing member' });
  }
});

// POST /shop/regenerate-code — regenerate invite code (owner only)
router.post('/regenerate-code', authMiddleware, requireShop, requireOwner, async (req: AuthRequest, res) => {
  try {
    const newCode = await generateInviteCode();
    await Shop.findByIdAndUpdate(req.shopId, { inviteCode: newCode });
    res.json({ inviteCode: newCode });
  } catch (error) {
    res.status(500).json({ message: 'Error regenerating invite code' });
  }
});

// GET /shop/seller-stats — analytics per seller (owner only)
router.get('/seller-stats', authMiddleware, requireShop, requireOwner, async (req: AuthRequest, res) => {
  try {
    const { period = 'today' } = req.query;

    const now = new Date();
    let fromDate: string;

    if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      fromDate = localDateString(d);
    } else if (period === 'month') {
      // Get the local date string for 'now', then take YYYY-MM and append -01
      const localNow = localDateString(now);
      fromDate = localNow.substring(0, 7) + '-01';
    } else {
      fromDate = localDateString(now);
    }

    const stats = await Sale.aggregate([
      { $match: { shopId: new mongoose.Types.ObjectId(req.shopId), created_at: { $gte: fromDate } } },
      {
        $group: {
          _id: '$sellerId',
          sellerName: { $first: '$sellerName' },
          revenue: { $sum: { $multiply: ['$sell_price', '$quantity'] } },
          salesCount: { $sum: 1 },
          profit: { $sum: '$profit' },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    res.json({ period, stats });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching seller stats' });
  }
});

export default router;
