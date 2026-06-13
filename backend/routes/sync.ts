import express from 'express';
import Sale from '../models/Sale';
import Product from '../models/Product';
import User from '../models/User';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/push', authMiddleware, async (req: AuthRequest, res) => {
  const { sales, products } = req.body;
  const userId = req.userId;

  try {
    if (products && Array.isArray(products)) {
      const productOps = products.map(p => ({
        updateOne: {
          filter: { userId, localId: p.id },
          update: { ...p, userId, localId: p.id },
          upsert: true,
        },
      }));
      if (productOps.length > 0) await Product.bulkWrite(productOps);
    }

    if (sales && Array.isArray(sales)) {
      const saleOps = sales.map(s => ({
        updateOne: {
          filter: { userId, localId: s.id },
          update: { ...s, userId, localId: s.id },
          upsert: true,
        },
      }));
      if (saleOps.length > 0) await Sale.bulkWrite(saleOps);
    }

    await User.findByIdAndUpdate(userId, { lastSyncAt: new Date() });
    res.json({ syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Push error:', error);
    res.status(500).json({ message: 'Error during push sync' });
  }
});

router.get('/pull', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.userId;
  try {
    const products = await Product.find({ userId });
    const sales = await Sale.find({ userId });
    res.json({ products, sales });
  } catch (error) {
    res.status(500).json({ message: 'Error during pull sync' });
  }
});

export default router;
