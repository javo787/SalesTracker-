const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function initDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not defined');
    return;
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(process.env.MONGODB_DB_NAME || 'savdo');

    // Create direct_ads collection if it doesn't exist
    const collections = await db.listCollections({ name: 'direct_ads' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('direct_ads');
      console.log('Collection direct_ads created');
    } else {
      console.log('Collection direct_ads already exists');
    }

    // Insert a test ad if empty
    const count = await db.collection('direct_ads').countDocuments();
    if (count === 0) {
      await db.collection('direct_ads').insertOne({
        title: 'Добро пожаловать в SavdoApp!',
        subtitle: 'Управляйте своим бизнесом эффективно',
        imageUrl: 'https://savdo.app/icon.png',
        targetUrl: 'https://savdo.app',
        active: true,
        priority: 0,
        clicks: 0,
        createdAt: new Date()
      });
      console.log('Test ad inserted');
    }

    // Create ad_clicks collection for historical data
    const clickCollections = await db.listCollections({ name: 'ad_clicks' }).toArray();
    if (clickCollections.length === 0) {
      await db.createCollection('ad_clicks');
      console.log('Collection ad_clicks created');
    }

  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    await client.close();
  }
}

initDb();
