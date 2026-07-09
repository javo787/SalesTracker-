import express from 'express';
import { authMiddleware, AuthRequest, requireShop } from '../middleware/authMiddleware';
import StockReceipt from '../models/StockReceipt';
import CronRun from '../models/CronRun';
import { runStockReceiptSummary } from '../services/stockReceiptService';

const router = express.Router();

router.post('/receipt-log', authMiddleware, requireShop, async (req: AuthRequest, res) => {
  if (req.role !== 'seller') {
    return res.json({ success: true, skipped: true });
  }

  try {
    const { productName, quantity, unit, pricePerUnit, note } = req.body;
    if (!productName || typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ message: 'productName and quantity are required' });
    }

    await StockReceipt.create({
      shopId: req.shopId,
      sellerId: req.userId,
      sellerName: req.sellerName,
      productName,
      quantity,
      unit,
      pricePerUnit,
      note,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to log receipt', error: err.message });
  }
});

router.post('/run-receipt-summary', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const todayStr = new Date().toISOString().split('T')[0];

  try {
    await CronRun.create({ job: 'stock-receipt-summary', date: todayStr });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.json({ success: true, skipped: true, reason: 'already_ran_today' });
    }
    return res.status(500).json({ message: 'Failed to claim cron run', error: err.message });
  }

  try {
    const result = await runStockReceiptSummary();
    res.json({ success: true, ...result });
  } catch (err: any) {
    await CronRun.deleteOne({ job: 'stock-receipt-summary', date: todayStr }).catch(() => {});
    res.status(500).json({ message: 'Receipt summary failed', error: err.message });
  }
});

export default router;
