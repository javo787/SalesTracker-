// Одноразовая миграция: меняет уникальный индекс коллекции products
// с {shopId, localId} на {shopId, userId, localId}.
//
// Проблема: {shopId, localId} без userId считал уникальным localId в рамках
// ВСЕГО магазина, а не в рамках устройства, которое его прислало. localId —
// это локальный SQLite AUTOINCREMENT конкретного устройства (не глобальный
// id), и с тех пор как товары стал пушить не только владелец, но и любой
// продавец с правом manage_products (у каждого устройства своя независимая
// последовательность localId, тоже начинающаяся с 1,2,3...), два разных
// человека с совпавшим числом localId могли столкнуться на этом индексе —
// см. PR #245 (backend/routes/sync.ts, backend/models/Product.ts).
//
// Это ЧИСТО индексная миграция, данные не трогает и не может их испортить:
// раз старый индекс был unique, в базе физически не могло накопиться строк,
// нарушающих его — трогаем только метаданные индекса.
//
// Запуск (один раз, локально, с production-строкой подключения):
//   cd backend
//   MONGODB_URI="<строка из Render → Environment>" npx ts-node scripts/fix-product-index.ts

import 'dotenv/config';
import dns from 'dns';
import mongoose from 'mongoose';
import Product from '../models/Product';

// Частая проблема на Windows/в некоторых сетях СНГ: системный DNS не отдаёт
// SRV-записи (mongodb+srv://...) корректно → "querySrv ECONNREFUSED".
// Явно переключаемся на публичный DNS Google, это обходит проблему.
dns.setServers(['8.8.8.8', '8.8.4.4']);

function redact(uri: string): string {
  // /g — на случай если строка подключения попадёт в вывод больше одного раза
  return uri.replace(/\/\/[^@]*@/g, '//<hidden>@');
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/savdo';
  console.log('Подключаюсь к:', redact(uri));
  await mongoose.connect(uri);

  console.log('\n=== Индексы products ДО исправления ===');
  console.log(JSON.stringify(await Product.collection.indexes(), null, 2));

  console.log('\n=== Синхронизирую индексы согласно текущей схеме ===');
  // syncIndexes() дропнет индексы, не совпадающие с текущей схемой Product.ts
  // (в т.ч. старый уникальный shopId_1_localId_1), и создаст недостающие —
  // включая новый составной shopId_1_userId_1_localId_1.
  const syncResult = await Product.syncIndexes();
  console.log('Результат syncIndexes:', syncResult);

  console.log('\n=== Индексы products ПОСЛЕ исправления ===');
  console.log(JSON.stringify(await Product.collection.indexes(), null, 2));

  await mongoose.connection.close();
  console.log('\nГотово.');
}

main().catch((err) => {
  console.error('Ошибка миграции:', err);
  process.exit(1);
});
