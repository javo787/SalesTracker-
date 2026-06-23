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
      const allowedProductFields = [
        'name', 'buy_price', 'sell_price', 'stock', 'min_stock_alert',
        'base_unit', 'has_packages', 'package_name', 'units_per_package',
        'category', 'updated_at', 'is_deleted',
      ];
      const productOps = products.map(p => {
        const update: Record<string, any> = { userId, localId: p.id };
        for (const key of allowedProductFields) {
          if (p[key] !== undefined) update[key] = p[key];
        }
        return {
          updateOne: {
            filter: { userId, localId: p.id },
            update,
            upsert: true,
          },
        };
      });
      if (productOps.length > 0) await Product.bulkWrite(productOps);
    }

    if (sales && Array.isArray(sales)) {
      const allowedSaleFields = [
        'product_id', 'product_name', 'quantity', 'sell_price',
        'buy_price', 'profit', 'note', 'stock_updated', 'created_at',
      ];
      const saleOps = sales.map(s => {
        const update: Record<string, any> = { userId, localId: s.id };
        for (const key of allowedSaleFields) {
          if (s[key] !== undefined) update[key] = s[key];
        }
        return {
          updateOne: {
            filter: { userId, localId: s.id },
            update,
            upsert: true,
          },
        };
      });
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
