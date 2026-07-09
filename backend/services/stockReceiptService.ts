import ShopMember from '../models/ShopMember';
import User from '../models/User';
import StockReceipt, { IStockReceipt } from '../models/StockReceipt';
import { sendPushNotification } from './firebase';

const MAX_MESSAGE_LENGTH = 300;

function buildSummaryMessage(receipts: IStockReceipt[]): string {
  const bySeller = new Map<string, { count: number; items: string[] }>();

  for (const r of receipts) {
    const entry = bySeller.get(r.sellerName) || { count: 0, items: [] };
    entry.count += 1;
    entry.items.push(`${r.productName} +${r.quantity}${r.unit ? ' ' + r.unit : ''}`);
    bySeller.set(r.sellerName, entry);
  }

  const detailed = Array.from(bySeller.entries())
    .map(([sellerName, entry]) => `${sellerName}: ${entry.items.join(', ')}`)
    .join('; ');

  if (detailed.length <= MAX_MESSAGE_LENGTH) return detailed;

  return Array.from(bySeller.entries())
    .map(([sellerName, entry]) => `${sellerName}: ${entry.count} поз.`)
    .join(', ');
}

export async function runStockReceiptSummary(): Promise<{ notified: number; skipped: number }> {
  let notified = 0;
  let skipped = 0;

  const pending = await StockReceipt.find({ notified: false }).lean<IStockReceipt[]>();
  if (pending.length === 0) return { notified, skipped };

  const byShop = new Map<string, IStockReceipt[]>();
  for (const r of pending) {
    const key = r.shopId.toString();
    if (!byShop.has(key)) byShop.set(key, []);
    byShop.get(key)!.push(r);
  }

  for (const [shopId, receipts] of byShop) {
    const ownerMember = await ShopMember.findOne({ shopId, role: 'owner', isActive: true }).lean();
    const ownerUser = ownerMember ? await User.findById(ownerMember.userId).lean() : null;

    const receiptIds = receipts.map(r => (r as any)._id);

    if (ownerUser?.fcmToken && ownerUser.notificationsEnabled) {
      const msg = buildSummaryMessage(receipts);
      const sent = await sendPushNotification(
        ownerUser.fcmToken,
        '📦 Приёмка товара за день',
        msg,
        { type: 'stock_receipt_summary', shopId }
      );
      if (sent) notified++; else skipped++;
    } else {
      skipped++;
    }

    await StockReceipt.updateMany(
      { _id: { $in: receiptIds } },
      { $set: { notified: true } }
    );
  }

  return { notified, skipped };
}
