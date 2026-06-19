import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (!uri) {
  // During build time, MONGODB_URI might be missing.
  // We export a rejected promise instead of throwing at the top level
  // to avoid crashing the Next.js build process during page data collection.
  clientPromise = Promise.reject(new Error('Please add your Mongo URI to environment variables'));
} else {
  if (process.env.NODE_ENV === 'development') {
    // @ts-ignore
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      // @ts-ignore
      global._mongoClientPromise = client.connect();
    }
    // @ts-ignore
    clientPromise = global._mongoClientPromise;
  } else {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
}

export default clientPromise;
