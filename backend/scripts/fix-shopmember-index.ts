// Одноразовая миграция: чинит конфликт индекса userId_1 в коллекции shopmembers.
//
// Проблема: схема ShopMember хочет ЧАСТИЧНЫЙ уникальный индекс
// ({ userId: 1 }, { unique: true, partialFilterExpression: { isActive: true } }),
// но в реальной базе уже существует старый ПРОСТОЙ уникальный индекс с тем же
// именем "userId_1" (без partialFilterExpression). Mongoose не может
// автоматически заменить индекс с тем же именем, но другими опциями —
// он просто логирует ошибку (IndexKeySpecsConflict, code 86) и продолжает
// работать со старым индексом. В итоге пользователь не может создать/
// присоединиться ко второму магазину, даже если его членство в предыдущем
// магазине уже неактивно (isActive: false) — старый индекс об этом не знает.
//
// Запуск (один раз, локально, с production-строкой подключения):
//   cd backend
//   MONGODB_URI="<строка из Render → Environment>" npx ts-node scripts/fix-shopmember-index.ts
//
// Скрипт ничего не удаляет из данных — только пересобирает индексы согласно
// текущей схеме. Диагностический блок в конце — read-only, ничего не меняет.

import 'dotenv/config';
import dns from 'dns';
import mongoose from 'mongoose';
import ShopMember from '../models/ShopMember';

// Частая проблема на Windows/в некоторых сетях СНГ: системный DNS не отдаёт
// SRV-записи (mongodb+srv://...) корректно → "querySrv ECONNREFUSED".
// Явно переключаемся на публичный DNS Google, это обходит проблему.
dns.setServers(['8.8.8.8', '8.8.4.4']);

// userId из ошибки в логах Render — просто для диагностики, ничего не меняем
const STUCK_USER_ID = '6a550b898f77963d97809d91';

function redact(uri: string): string {
  // /g — на случай если строка подключения попадёт в вывод больше одного раза
  return uri.replace(/\/\/[^@]*@/g, '//<hidden>@');
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/savdo';
  console.log('Подключаюсь к:', redact(uri));
  await mongoose.connect(uri);

  console.log('\n=== Индексы shopmembers ДО исправления ===');
  console.log(JSON.stringify(await ShopMember.collection.indexes(), null, 2));

  console.log('\n=== Синхронизирую индексы согласно схеме ===');
  // syncIndexes() удалит индексы, не совпадающие со схемой (в т.ч. по опциям),
  // и создаст недостающие — включая партиционированный userId_1.
  const syncResult = await ShopMember.syncIndexes();
  console.log('Результат syncIndexes:', syncResult);

  console.log('\n=== Индексы shopmembers ПОСЛЕ исправления ===');
  console.log(JSON.stringify(await ShopMember.collection.indexes(), null, 2));

  console.log(`\n=== Диагностика по userId ${STUCK_USER_ID} (read-only) ===`);
  const records = await ShopMember.find({ userId: STUCK_USER_ID }).lean();
  if (records.length === 0) {
    console.log('Записей не найдено — странно, но после фикса индекса Create shop должен пройти.');
  } else {
    console.log(`Найдено записей: ${records.length}`);
    for (const r of records) {
      console.log({
        _id: r._id,
        shopId: r.shopId,
        role: r.role,
        isActive: r.isActive,
        joinedAt: r.joinedAt,
      });
    }
    const activeOnes = records.filter((r: any) => r.isActive);
    if (activeOnes.length > 0) {
      console.log(
        '\nВНИМАНИЕ: у пользователя есть АКТИВНОЕ членство в другом магазине.\n' +
        'Это не баг индекса — это осознанное правило "один активный магазин на пользователя".\n' +
        'Если это не должно так быть (например, зависший leaveShop), деактивируй вручную:\n' +
        `  await ShopMember.updateOne({ _id: "${activeOnes[0]._id}" }, { isActive: false })`
      );
    } else {
      console.log('\nВсе записи неактивны (isActive: false) — после фикса индекса Create shop должен пройти без проблем.');
    }
  }

  await mongoose.connection.close();
  console.log('\nГотово.');
}

main().catch((err) => {
  console.error('Ошибка миграции:', err);
  process.exit(1);
});