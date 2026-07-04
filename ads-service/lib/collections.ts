import clientPromise from './mongodb';

// TODO: Consider renaming DB_NAME to 'torgo' after data migration.
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

export async function getWholesaleRequestsCollection() {
  const db = await getDb();
  return db.collection('wholesale_requests');
}

export async function getNewsCollection() {
  const db = await getDb();
  return db.collection('news_feed');
}

/**
 * ID STRATEGY NOTE:
 * - classifieds: Uses UUID strings for _id to simplify client-side generation
 *   and ensure portability across potential future sync mechanisms.
 * - other collections (wholesale, ads, news): Use standard MongoDB ObjectIds.
 */

// Singleton guard — ensureIndexes runs at most once per serverless instance.
// Without this, every GET /api/news call triggers dropIndex + createIndexes,
// causing write lock contention and intermittent 500 errors on reads.
let _indexesEnsured = false;
let _indexesPromise: Promise<void> | null = null;

export async function ensureIndexes(): Promise<void> {
  if (_indexesEnsured) return;
  if (_indexesPromise) return _indexesPromise;

  _indexesPromise = (async () => {
    const db = await getDb();

    // Remove legacy TTL index if it exists (one-time migration)
    try {
      await db.collection('news_feed').dropIndex('ttl_news');
    } catch {
      // Index does not exist — ignore
    }

    await db.collection('classifieds').createIndexes([
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'ttl_classifieds' },
      { key: { city: 1, category: 1, isActive: 1, moderationStatus: 1 }, name: 'query_classifieds' },
      { key: { userId: 1, isActive: 1 }, name: 'user_classifieds' },
    ]);

    await db.collection('wholesale_ads').createIndexes([
      { key: { isActive: 1, isPaid: 1, paidUntil: 1, tierOrder: -1, priority: -1 }, name: 'query_wholesale_v3' },
    ]);

    await db.collection('wholesale_requests').createIndexes([
      { key: { createdAt: -1 }, name: 'requests_time' },
    ]);

    await db.collection('news_feed').createIndexes([
      { key: { generatedAt: 1 }, expireAfterSeconds: 1209600, name: 'ttl_news_v2' },
      { key: { date: -1 }, unique: true, name: 'date_news_unique' },
    ]);

    _indexesEnsured = true;
  })();

  return _indexesPromise;
}
