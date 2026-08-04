import express from 'express';
import Sale from '../models/Sale';
import Product from '../models/Product';
import User from '../models/User';
import Expense from '../models/Expense';
import StockMovement from '../models/StockMovement';
import ShopMember from '../models/ShopMember';
import { authMiddleware, requireShop, AuthRequest } from '../middleware/authMiddleware';
import { sendSilentDataMessage } from '../services/firebase';
import mongoose from 'mongoose';

const router = express.Router();

// Короткий per-shop cooldown, чтобы при частых мелких push (debounce на клиенте
// и так сглаживает большинство случаев, но не все — например пачка отдельных
// stock_in подряд) не слать лишние FCM-сообщения сверх необходимого. Сама
// инвалидация дешёвая (data-only, без показа пользователю), это просто гигиена
// на стороне Firebase API, а не защита от перегрузки.
const FANOUT_COOLDOWN_MS = 5000;
const lastFanoutAt = new Map<string, number>();

// Будит другие открытые устройства этого магазина тихим data-only пушем,
// чтобы они сразу подтянули изменения через pull() — вместо того, чтобы
// каждое устройство само поллило /sync/pull раз в N секунд "на всякий случай".
// Fire-and-forget: ошибки здесь никогда не должны ронять сам /sync/push.
async function notifyOtherShopMembers(shopObjectId: mongoose.Types.ObjectId, excludeUserId: mongoose.Types.ObjectId) {
  const shopKey = shopObjectId.toString();
  const now = Date.now();
  const last = lastFanoutAt.get(shopKey) || 0;
  if (now - last < FANOUT_COOLDOWN_MS) return;
  lastFanoutAt.set(shopKey, now);

  try {
    const members = await ShopMember.find({ shopId: shopObjectId, isActive: true, userId: { $ne: excludeUserId } })
      .select('userId')
      .lean();
    if (members.length === 0) return;

    const userIds = members.map(m => m.userId);
    const users = await User.find({
      _id: { $in: userIds },
      fcmToken: { $ne: null },
      notificationsEnabled: true,
    }).select('fcmToken').lean();

    await Promise.all(
      users.map(u => sendSilentDataMessage(u.fcmToken as string, { type: 'shop_sync', shopId: shopKey }))
    );
  } catch (err) {
    console.warn('notifyOtherShopMembers failed (non-fatal):', err);
  }
}

// Короткий in-memory кэш полного списка товаров магазина — сглаживает всплеск,
// когда несколько продавцов одного магазина открывают приложение почти одновременно.
const PULL_CACHE_TTL_MS = 8000;
const shopProductsCache = new Map<string, { data: any[]; expiresAt: number }>();

async function getShopProductsCached(shopObjectId: mongoose.Types.ObjectId): Promise<any[]> {
  const key = shopObjectId.toString();
  const cached = shopProductsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const data = await Product.find({ shopId: shopObjectId }).lean();
  shopProductsCache.set(key, { data, expiresAt: Date.now() + PULL_CACHE_TTL_MS });
  return data;
}

function invalidateShopProductsCache(shopId: string) {
  shopProductsCache.delete(shopId);
}

// POST /sync/push
router.post('/push', authMiddleware, requireShop, async (req: AuthRequest, res) => {
  const { sales, products, expenses, stockMovements } = req.body;
  const shopObjectId = new mongoose.Types.ObjectId(req.shopId!);
  const sellerObjectId = new mongoose.Types.ObjectId(req.userId!);

  try {
    // PRODUCTS: owner or a seller with 'manage_products' can push everything,
    // including buy_price — full parity, no owner-only carve-out (same
    // boundary mirrored on the pull side below).
    //
    // Bug fix: this used to upsert on {shopId, localId} alone. `localId` is
    // just the pushing device's own SQLite AUTOINCREMENT counter — it was
    // never unique across devices, only within one device's database. That
    // was harmless while only the owner's device ever pushed products (a
    // single writer -> a single id-space), but once a seller with
    // manage_products started pushing products too (each with their own
    // independent counter, also starting at 1, 2, 3...), two completely
    // unrelated products from different devices could land on the same
    // localId number. The upsert filter didn't check who authored the
    // document, so the second push silently overwrote (or, if is_deleted,
    // permanently removed) a totally unrelated product belonging to someone
    // else. Fix: match existing products by their real Mongo _id (sent back
    // from a previous pull as remote_id) whenever the client already knows
    // it; a product the client has never synced before is always a plain
    // insert (never an upsert keyed on the collision-prone localId), so it
    // can never clobber someone else's document.
    const canManageProducts = req.role === 'owner' || req.permissions?.includes('manage_products');
    if (products && Array.isArray(products) && canManageProducts) {
      const allowedProductFields = ['name', 'buy_price', 'sell_price', 'stock', 'min_stock_alert',
           'base_unit', 'has_packages', 'package_name', 'units_per_package',
           'category', 'updated_at', 'is_deleted'];

      const productOps = products.map((p: any) => {
        const update: Record<string, any> = {
          shopId: shopObjectId,
          userId: sellerObjectId,
          localId: p.id,
        };
        for (const key of allowedProductFields) {
          if (p[key] !== undefined) update[key] = p[key];
        }
        // Серверная метка времени (UTC, Date) — авторитетный источник для
        // дельта-синхронизации. Клиентский updated_at не годится: это
        // локальное время устройства владельца без TZ и в другом формате,
        // строковое сравнение с since (полный ISO 8601) даёт неверный результат.
        update.serverUpdatedAt = new Date();

        if (p.remote_id) {
          // Already-synced product — target it by its real, globally unique
          // _id. No upsert: if the document is somehow gone, do nothing
          // rather than resurrecting it under someone else's localId.
          return {
            updateOne: {
              filter: { _id: new mongoose.Types.ObjectId(p.remote_id), shopId: shopObjectId },
              update: { $set: update },
            },
          };
        }
        // Never synced before — always a fresh document, so it can never
        // collide with an existing one just because the numeric localId
        // happens to match.
        return { insertOne: { document: update } };
      });
      if (productOps.length > 0) {
        await Product.bulkWrite(productOps);
        invalidateShopProductsCache(req.shopId!);
        notifyOtherShopMembers(shopObjectId, sellerObjectId);
      }
    }

    // STOCK MOVEMENTS: append-only журнал, дедуп по clientId (UUID с клиента).
    // stock_in доступен любому сотруднику (приёмка товара), остальные типы
    // (waste/correction/edit) — owner или seller с 'manage_products', та же
    // граница, что и на управление каталогом.
    if (stockMovements && Array.isArray(stockMovements)) {
      const allowedMovementTypes = canManageProducts
        ? ['stock_in', 'waste', 'correction', 'edit']
        : ['stock_in'];
      const validMovements = stockMovements.filter((m: any) => allowedMovementTypes.includes(m.type));


      for (const m of validMovements) {
        try {
          await StockMovement.create({
            shopId: shopObjectId,
            productLocalId: m.product_id,
            clientId: m.id,
            type: m.type,
            quantityChange: m.quantity_change,
            pricePerUnit: m.price_per_unit ?? null,
            note: m.note,
            sellerId: m.seller_id || req.userId,
            sellerName: m.seller_name || req.sellerName,
            createdAt: m.created_at,
          });
        } catch (e: any) {
          // 11000 = дубликат по {shopId, clientId} — уже синкнуто раньше,
          // это нормально при повторном push (withRetry на фронте и т.п.).
          if (e.code !== 11000) throw e;
        }
      }
      if (validMovements.length > 0) {
        notifyOtherShopMembers(shopObjectId, sellerObjectId);
      }
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
        // Серверная метка времени для дельта-синхронизации (см. комментарий
        // в блоке PRODUCTS выше) — created_at от клиента для этого не годится.
        update.serverUpdatedAt = new Date();

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
        let stockDecremented = false;
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
              { $inc: { stock: -s.quantity }, $set: { updated_at: new Date().toISOString(), serverUpdatedAt: new Date() } }
            );
            stockDecremented = true;
          }
        }
        if (stockDecremented) {
          invalidateShopProductsCache(req.shopId!);
        }
      }
    }

    // EXPENSES: owners and sellers, каждый пушит свои
    if (expenses && Array.isArray(expenses)) {
      const allowedExpenseFields = ['type', 'category', 'amount', 'description', 'linked_product_id', 'created_at'];
      const expenseOps = expenses.map((e: any) => {
        const update: Record<string, any> = {
          shopId: shopObjectId,
          sellerId: sellerObjectId,
          sellerName: req.sellerName || 'Unknown',
          localId: e.id,
        };
        for (const key of allowedExpenseFields) {
          if (e[key] !== undefined) update[key] = e[key];
        }
        update.serverUpdatedAt = new Date();
        return {
          updateOne: {
            filter: { shopId: shopObjectId, sellerId: sellerObjectId, localId: e.id },
            update: { $set: update },
            upsert: true,
          },
        };
      });
      if (expenseOps.length > 0) await Expense.bulkWrite(expenseOps);
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
  // Полный паритет с владельцем: закупочные цены/маржа — та же граница, что
  // и право редактировать каталог; видимость данных всей команды (а не
  // только своих продаж/расходов) — та же граница, что и право управлять
  // командой (manage_team и так уже подразумевает "видеть статистику команды").
  const canSeeFinancials = isOwner || !!req.permissions?.includes('manage_products');
  const canSeeAllSales = isOwner || !!req.permissions?.includes('manage_team');
  const { since } = req.query;
  const asOf = new Date().toISOString();

  try {
    // Единая точка отсчёта для дельты: конвертируем since (ISO 8601 от клиента,
    // сохранённый из предыдущего asOf) в реальный Date один раз.
    const sinceDate = since ? new Date(since as string) : null;

    // Products: everyone gets them, but buy_price needs manage_products (or owner)
    // Include all products including deleted ones for sync purposes
    const allProducts = await getShopProductsCached(shopObjectId);
    // Фильтруем по serverUpdatedAt (серверный Date), а НЕ по клиентскому
    // updated_at — то строка в локальном времени владельца без TZ и без 'T',
    // и лексикографическое сравнение с since (полный ISO 8601) было всегда
    // ложным, из-за чего товары, добавленные/изменённые после первого pull,
    // никогда не попадали к продавцам.
    const productsRaw = sinceDate
      ? allProducts.filter((p: any) => p.serverUpdatedAt && new Date(p.serverUpdatedAt) >= sinceDate)
      : allProducts;

    const products = productsRaw.map((p: any) => {
      if (!canSeeFinancials) {
        // No manage_products permission — buy_price stays hidden
        const { buy_price, ...rest } = p;
        return { ...rest, buy_price: null };
      }
      return p;
    });

    // Sales:
    // - owner or manage_team seller gets all shop sales
    // - otherwise, only their own
    const salesQuery: any = { shopId: shopObjectId };
    if (!canSeeAllSales) {
      salesQuery.sellerId = new mongoose.Types.ObjectId(req.userId!);
    }
    if (sinceDate) {
      // Аналогично товарам: created_at — локальное время устройства
      // продавца без TZ, для дельты используем серверную метку.
      salesQuery.serverUpdatedAt = { $gte: sinceDate };
    }

    const salesRaw = await Sale.find(salesQuery).lean();

    const sales = salesRaw.map((s: any) => {
      if (!canSeeFinancials) {
        // No manage_products permission — buy_price and profit stay hidden
        const { buy_price, profit, ...rest } = s;
        return { ...rest, buy_price: null, profit: null };
      }
      return s;
    });

    // Expenses: owner/manage_team получают все расходы магазина, остальные — только свои
    const expensesQuery: any = { shopId: shopObjectId };
    if (!canSeeAllSales) {
      expensesQuery.sellerId = new mongoose.Types.ObjectId(req.userId!);
    }
    if (sinceDate) {
      expensesQuery.serverUpdatedAt = { $gte: sinceDate };
    }
    const expenses = await Expense.find(expensesQuery).lean();

    // Stock movements: журнал доступен всем в магазине (важно видеть, кто
    // и когда трогал остаток), но цена за единицу (себестоимость на
    // приёмке) — та же граница, что и buy_price у товара: manage_products/owner.
    const movementsQuery: any = { shopId: shopObjectId };
    if (sinceDate) {
      movementsQuery.serverCreatedAt = { $gte: sinceDate };
    }
    const movementsRaw = await StockMovement.find(movementsQuery).lean();
    const stockMovements = movementsRaw.map((m: any) => {
      if (!canSeeFinancials) {
        return { ...m, pricePerUnit: null };
      }
      return m;
    });

    res.json({ products, sales, expenses, stockMovements, role: req.role, shopId: req.shopId, asOf });
  } catch (error) {
    console.error('Pull error:', error);
    res.status(500).json({ message: 'Error during pull sync' });
  }
});

export default router;
