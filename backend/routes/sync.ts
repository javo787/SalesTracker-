import express from 'express';
import Sale from '../models/Sale';
import Product from '../models/Product';
import User from '../models/User';
import { authMiddleware, requireShop, AuthRequest } from '../middleware/authMiddleware';
import mongoose from 'mongoose';

const router = express.Router();

// POST /sync/push
router.post('/push', authMiddleware, requireShop, async (req: AuthRequest, res) => {
  const { sales, products } = req.body;
  const shopObjectId = new mongoose.Types.ObjectId(req.shopId!);
  const sellerObjectId = new mongoose.Types.ObjectId(req.userId!);

  try {
    // PRODUCTS: only owner can push
    if (products && Array.isArray(products) && req.role === 'owner') {
      const allowedProductFields = [
        'name', 'buy_price', 'sell_price', 'stock', 'min_stock_alert',
        'base_unit', 'has_packages', 'package_name', 'units_per_package',
        'category', 'updated_at', 'is_deleted',
      ];

      const productOps = products.map((p: any) => {
        const update: Record<string, any> = {
          shopId: shopObjectId,
          userId: sellerObjectId,
          localId: p.id,
        };
        for (const key of allowedProductFields) {
          if (p[key] !== undefined) update[key] = p[key];
        }
        return {
          updateOne: {
            filter: { shopId: shopObjectId, localId: p.id },
            update: { $set: update },
            upsert: true,
          },
        };
      });
      if (productOps.length > 0) await Product.bulkWrite(productOps);
    }

    // SALES: owners and sellers
    if (sales && Array.isArray(sales)) {
      const allowedSaleFields = [
        'product_id', 'product_name', 'quantity', 'sell_price',
        'buy_price', 'profit', 'note', 'stock_updated', 'created_at',
        'stock_warning',
      ];

      const saleOps = sales.map((s: any) => {
        const update: Record<string, any> = {
          shopId: shopObjectId,
          sellerId: sellerObjectId,
          userId: sellerObjectId,
          sellerName: req.sellerName || 'Unknown',
          localId: s.id,
        };

        for (const key of allowedSaleFields) {
          if (s[key] !== undefined) {
            // SECURITY: seller cannot push buy_price / profit
            if (req.role === 'seller' && (key === 'buy_price' || key === 'profit')) continue;
            update[key] = s[key];
          }
        }

        return {
          updateOne: {
            filter: { shopId: shopObjectId, sellerId: sellerObjectId, localId: s.id },
            update: { $set: update },
            upsert: true,
          },
        };
      });

      if (saleOps.length > 0) await Sale.bulkWrite(saleOps);

      // Update stock on server based on new sales
      if (req.role === 'seller') {
        for (const s of sales) {
          if (s.product_id && s.quantity && s.stock_updated === 1) {
            // Check if stock is sufficient
            const product = await Product.findOne({ shopId: shopObjectId, localId: s.product_id });
            const hasSufficientStock = product && product.stock >= s.quantity;

            if (!hasSufficientStock) {
              // Set warning if not enough stock, but still record sale (last-write-wins on stock decrement)
              await Sale.findOneAndUpdate(
                { shopId: shopObjectId, sellerId: sellerObjectId, localId: s.id },
                { $set: { stock_warning: true } }
              );
            }

            // Still decrement stock (it might go negative)
            await Product.findOneAndUpdate(
              { shopId: shopObjectId, localId: s.product_id },
              { $inc: { stock: -s.quantity } }
            );
          }
        }
      }
    }

    await User.findByIdAndUpdate(req.userId, { lastSyncAt: new Date() });
    res.json({ syncedAt: new Date().toISOString(), role: req.role });
  } catch (error) {
    console.error('Push error:', error);
    res.status(500).json({ message: 'Error during push sync' });
  }
});

// GET /sync/pull
router.get('/pull', authMiddleware, requireShop, async (req: AuthRequest, res) => {
  const shopObjectId = new mongoose.Types.ObjectId(req.shopId!);
  const isOwner = req.role === 'owner';

  try {
    // Products: everyone gets them, but buy_price is owner only
    // Products: everyone gets them, but buy_price is owner only
    // Include all products including deleted ones for sync purposes
    const productsRaw = await Product.find({ shopId: shopObjectId }).lean();

    const products = productsRaw.map((p: any) => {
      if (!isOwner) {
        // Seller MUST NOT get buy_price
        const { buy_price, ...rest } = p;
        return { ...rest, buy_price: null };
      }
      return p;
    });

    // Sales:
    // - owner gets all shop sales
    // - seller gets only their own
    const salesQuery: any = { shopId: shopObjectId };
    if (!isOwner) {
      salesQuery.sellerId = new mongoose.Types.ObjectId(req.userId!);
    }

    const salesRaw = await Sale.find(salesQuery).lean();

    const sales = salesRaw.map((s: any) => {
      if (!isOwner) {
        // Seller MUST NOT get buy_price and profit
        const { buy_price, profit, ...rest } = s;
        return { ...rest, buy_price: null, profit: null };
      }
      return s;
    });

    res.json({ products, sales, role: req.role, shopId: req.shopId });
  } catch (error) {
    console.error('Pull error:', error);
    res.status(500).json({ message: 'Error during pull sync' });
  }
});

export default router;
