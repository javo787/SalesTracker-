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
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { name, avatarUrl },
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
      referralLink: `savdo://register?code=${user?.referralCode}`,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching referral info' });
  }
});

export default router;
