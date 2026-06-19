import clientPromise from './mongodb';

const DB_NAME = process.env.MONGODB_DB_NAME || 'savdo';

export async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getClassifiedsCollection() {
  const db = await getDb();
  return db.collection('classifieds');
}

export async function getWholesaleCollection() {
  const db = await getDb();
  return db.collection('wholesale_ads');
}

export async function getNewsCollection() {
  const db = await getDb();
  return db.collection('news_feed');
}

/**
 * Create all required indexes on first run.
 * Call this once from an init script or the first API request.
 */
export async function ensureIndexes() {
  const db = await getDb();

  // Classifieds: TTL 30 days + compound query index
  await db.collection('classifieds').createIndexes([
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'ttl_classifieds' },
    { key: { city: 1, category: 1, isActive: 1, moderationStatus: 1 }, name: 'query_classifieds' },
    { key: { userId: 1, isActive: 1 }, name: 'user_classifieds' },
  ]);

  // Wholesale: simple active query
  await db.collection('wholesale_ads').createIndexes([
    { key: { isActive: 1, isPaid: 1, paidUntil: 1, priority: -1 }, name: 'query_wholesale' },
  ]);

  // News: TTL 7 days
  await db.collection('news_feed').createIndexes([
    { key: { generatedAt: 1 }, expireAfterSeconds: 604800, name: 'ttl_news' },
    { key: { date: -1 }, name: 'date_news' },
  ]);
}
