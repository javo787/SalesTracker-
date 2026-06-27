import express from 'express';
import Shop from '../models/Shop';
import ShopMember from '../models/ShopMember';
import Sale from '../models/Sale';
import User from '../models/User';
import { authMiddleware, requireShop, requireOwner, AuthRequest } from '../middleware/authMiddleware';
import mongoose from 'mongoose';

const router = express.Router();

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
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const sellersWithStats = await Promise.all(
      members.map(async (m) => {
        const stats = await Sale.aggregate([
          {
            $match: {
              shopId: new mongoose.Types.ObjectId(req.shopId),
              sellerId: m.userId,
              created_at: { $gte: todayStr },
            },
          },
          {
            $group: {
              _id: null,
              todayRevenue: { $sum: { $multiply: ['$sell_price', '$quantity'] } },
              todaySalesCount: { $sum: 1 },
            },
          },
        ]);
        return {
          ...m,
          todayRevenue: stats[0]?.todayRevenue || 0,
          todaySalesCount: stats[0]?.todaySalesCount || 0,
        };
      })
    );

    res.json(sellersWithStats);
  } catch (error) {
    console.error('Fetch members error:', error);
    res.status(500).json({ message: 'Error fetching members' });
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
      const d = new Date(now); d.setDate(d.getDate() - 7);
      fromDate = d.toISOString().split('T')[0];
    } else if (period === 'month') {
      const d = new Date(now); d.setDate(1);
      fromDate = d.toISOString().split('T')[0];
    } else {
      fromDate = now.toISOString().split('T')[0];
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
