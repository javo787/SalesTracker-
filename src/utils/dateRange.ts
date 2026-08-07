/**
 * Единая точка правды для работы с локальным временем устройства во всём
 * приложении: и "сырые" метки времени (nowLocalISO/todayLocalDate — то, чем
 * проставляется created_at при записи), и границы календарных периодов для
 * запросов/отчётов (startOfDaysAgoLocalStr/endOfTodayLocalStr).
 *
 * created_at продаж/расходов хранится как 'YYYY-MM-DD HH:MM:SS' в локальном
 * времени устройства, БЕЗ конвертации в UTC. Раньше nowLocalISO()/
 * todayLocalDate() были продублированы внутри src/db/database.ts, а границы
 * периодов считались третьей, независимой функцией (daysAgoLocalISO) —
 * из-за этого разъехались друг с другом и дали баг "половина вчерашних
 * продаж добавляется к сегодняшним". Здесь — один файл, все остальные места
 * в коде импортируют функции отсюда, ничего не переопределяют заново.
 *
 * Чистые функции без сайд-эффектов и без зависимости от expo-sqlite/React
 * Native — можно тестировать в обычном Jest/Node (см.
 * __tests__/dateRange.test.ts).
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' в локальном времени переданной даты. */
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD HH:MM:SS' в локальном времени переданной даты. */
export function toLocalDateTimeStr(d: Date): string {
  return `${toLocalDateStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Текущее локальное время устройства как 'YYYY-MM-DD HH:MM:SS', БЕЗ
 * конвертации в UTC (в отличие от toISOString()). Используется при записи
 * created_at для новых продаж/расходов/чек-инов и т.п.
 */
export function nowLocalISO(now: Date = new Date()): string {
  return toLocalDateTimeStr(now);
}

/** Сегодняшняя дата в локальном времени устройства как 'YYYY-MM-DD'. */
export function todayLocalDate(now: Date = new Date()): string {
  return toLocalDateStr(now);
}

/** Начало (00:00:00) переданного дня в локальном времени. */
export function startOfLocalDayStr(d: Date): string {
  return `${toLocalDateStr(d)} 00:00:00`;
}

/** Конец (23:59:59) переданного дня в локальном времени. */
export function endOfLocalDayStr(d: Date): string {
  return `${toLocalDateStr(d)} 23:59:59`;
}

/**
 * Конец СЕГОДНЯШНЕГО дня в локальном времени — верхняя граница для отчётов
 * за период "N дней" (по умолчанию — сейчас).
 */
export function endOfTodayLocalStr(now: Date = new Date()): string {
  return endOfLocalDayStr(now);
}

/**
 * Начало календарного окна из `days` дней, заканчивающегося СЕГОДНЯ
 * включительно, в локальном времени.
 *
 *   days=1 → 00:00:00 сегодня       (окно: только сегодня)
 *   days=7 → 00:00:00 6 дней назад  (окно: 7 календарных дней, сегодня включительно)
 *
 * ВАЖНО: это НЕ "текущий момент минус days*24 часа" (скользящее окно).
 *
 * Раньше для этого использовалась daysAgoLocalISO(days), которая как раз и
 * вычисляла "сейчас минус N*24ч" (та же дата N дней назад, но с ТЕКУЩИМ
 * временем суток). Из-за этого период "Сегодня" (days=1) на деле возвращал
 * скользящее окно [сейчас-24ч, сейчас]: сегодняшние продажи ПЛЮС хвост
 * вчерашних — в среднем около половины суток вчера, если пользователь
 * смотрит отчёт в районе полудня. Это и было причиной бага "половина
 * вчерашних продаж добавляется к сегодняшним".
 */
export function startOfDaysAgoLocalStr(days: number, now: Date = new Date()): string {
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  startDay.setDate(startDay.getDate() - Math.max(0, days - 1));
  return startOfLocalDayStr(startDay);
}
