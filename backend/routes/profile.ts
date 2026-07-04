import express from 'express';
import User from '../models/User';
import Sale from '../models/Sale';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

router.patch('/', authMiddleware, async (req: AuthRequest, res) => {
  const { name, avatarUrl } = req.body;

  // Validate avatar: must be a data URI, base64 portion ≤ 300KB
  if (avatarUrl !== undefined && avatarUrl !== null) {
    if (typeof avatarUrl !== 'string') {
      return res.status(400).json({ message: 'avatarUrl must be a string' });
    }
    if (avatarUrl.length > 0 && !avatarUrl.startsWith('data:image/')) {
      return res.status(400).json({ message: 'avatarUrl must be a data URI' });
    }
    // base64 string length for 300KB image ≈ 409600 chars; add headroom for data URI prefix
    const MAX_AVATAR_CHARS = 450_000;
    if (avatarUrl.length > MAX_AVATAR_CHARS) {
      return res.status(413).json({ message: 'Avatar image too large (max ~300KB)' });
    }
  }

  try {
    const updateFields: Record<string, any> = {};
    if (name !== undefined) updateFields.name = name;
    if (avatarUrl !== undefined) updateFields.avatarUrl = avatarUrl;

    const user = await User.findByIdAndUpdate(
      req.userId,
      updateFields,
      { new: true }
    ).select('-passwordHash');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

router.get('/stats', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const stats = await Sale.aggregate([
      { $match: { userId: req.user?._id || new (require('mongoose').Types.ObjectId)(req.userId) } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $multiply: ['$sell_price', '$quantity'] } },
          totalProfit: { $sum: '$profit' },
          totalSales: { $sum: 1 },
        },
      },
    ]);

    const bestProduct = await Sale.aggregate([
      { $match: { userId: req.user?._id || new (require('mongoose').Types.ObjectId)(req.userId) } },
      {
        $group: {
          _id: '$product_name',
          profit: { $sum: '$profit' },
        },
      },
      { $sort: { profit: -1 } },
      { $limit: 1 },
    ]);

    const user = await User.findById(req.userId);

    res.json({
      totalRevenue: stats[0]?.totalRevenue || 0,
      totalProfit: stats[0]?.totalProfit || 0,
      totalSales: stats[0]?.totalSales || 0,
      bestProduct: bestProduct[0] ? { name: bestProduct[0]._id, profit: bestProduct[0].profit } : null,
      memberSince: user?.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Error calculating stats' });
  }
});

router.get('/referral', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({
      referralCode: user?.referralCode,
      referralCount: user?.referralCount,
      // referralLink would depend on your domain/app scheme
      referralLink: `torgo://register?code=${user?.referralCode}`,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching referral info' });
  }
});

export default router;
