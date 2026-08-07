import {
  toLocalDateStr,
  toLocalDateTimeStr,
  nowLocalISO,
  todayLocalDate,
  startOfLocalDayStr,
  endOfLocalDayStr,
  startOfDaysAgoLocalStr,
  endOfTodayLocalStr,
} from '../dateRange';

describe('nowLocalISO / todayLocalDate / toLocalDateTimeStr — единая логика вместо копий в database.ts', () => {
  it('todayLocalDate(now) не зависит от того, как в неё передана дата — совпадает с toLocalDateStr', () => {
    const d = new Date(2026, 7, 4, 21, 10, 5);
    expect(todayLocalDate(d)).toBe(toLocalDateStr(d));
    expect(todayLocalDate(d)).toBe('2026-08-04');
  });

  it('nowLocalISO(now) даёт полную дату-время без конвертации в UTC', () => {
    const d = new Date(2026, 7, 4, 21, 10, 5);
    expect(nowLocalISO(d)).toBe('2026-08-04 21:10:05');
    expect(toLocalDateTimeStr(d)).toBe('2026-08-04 21:10:05');
  });

  it('nowLocalISO() и todayLocalDate() без аргумента используют текущий момент (для реальных вызовов в приложении)', () => {
    const before = new Date();
    const iso = nowLocalISO();
    const dateOnly = todayLocalDate();
    expect(iso.startsWith(dateOnly)).toBe(true);
    expect(iso.slice(0, 10)).toBe(toLocalDateStr(before));
  });
});

describe('toLocalDateStr', () => {
  it('форматирует дату как YYYY-MM-DD в локальном времени', () => {
    expect(toLocalDateStr(new Date(2026, 7, 4, 23, 59, 59))).toBe('2026-08-04');
    expect(toLocalDateStr(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
  });

  it('дополняет месяц и день нулём', () => {
    expect(toLocalDateStr(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

describe('startOfLocalDayStr / endOfLocalDayStr', () => {
  it('возвращают 00:00:00 и 23:59:59 переданного дня независимо от времени суток', () => {
    const d = new Date(2026, 7, 4, 15, 30, 0);
    expect(startOfLocalDayStr(d)).toBe('2026-08-04 00:00:00');
    expect(endOfLocalDayStr(d)).toBe('2026-08-04 23:59:59');
  });
});

describe('endOfTodayLocalStr', () => {
  it('возвращает конец сегодняшнего дня для переданного "сейчас"', () => {
    expect(endOfTodayLocalStr(new Date(2026, 7, 4, 9, 0, 0))).toBe('2026-08-04 23:59:59');
  });
});

describe('startOfDaysAgoLocalStr — регрессия для бага "половина вчерашних продаж добавляется к сегодняшним"', () => {
  it('days=1 в ЛЮБОЕ время суток даёт начало СЕГОДНЯШНЕГО дня, а не "сейчас минус 24ч"', () => {
    // Полдень — именно тот случай, когда старая daysAgoLocalISO(1) возвращала
    // "вчера в это же время", и запрос "Сегодня" реально включал половину
    // вчерашнего дня.
    const noon = new Date(2026, 7, 4, 12, 0, 0);
    expect(startOfDaysAgoLocalStr(1, noon)).toBe('2026-08-04 00:00:00');

    const earlyMorning = new Date(2026, 7, 4, 0, 5, 0);
    expect(startOfDaysAgoLocalStr(1, earlyMorning)).toBe('2026-08-04 00:00:00');

    const lateNight = new Date(2026, 7, 4, 23, 55, 0);
    expect(startOfDaysAgoLocalStr(1, lateNight)).toBe('2026-08-04 00:00:00');
  });

  it('days=7 даёт начало дня 6 дней назад (7 календарных дней включительно с сегодня)', () => {
    const now = new Date(2026, 7, 4, 12, 0, 0); // 4 августа
    expect(startOfDaysAgoLocalStr(7, now)).toBe('2026-07-29 00:00:00');
  });

  it('корректно переходит через границу месяца и года', () => {
    const now = new Date(2026, 0, 2, 10, 0, 0); // 2 января 2026
    expect(startOfDaysAgoLocalStr(7, now)).toBe('2025-12-27 00:00:00');
  });

  it('days=1 не зависит от времени суток "сейчас" (устойчиво к моменту проверки)', () => {
    const results = [0, 6, 12, 18, 23].map(
      (hour) => startOfDaysAgoLocalStr(1, new Date(2026, 7, 10, hour, 0, 0))
    );
    results.forEach((r) => expect(r).toBe('2026-08-10 00:00:00'));
  });
});

describe('старое поведение daysAgoLocalISO — документация регрессии', () => {
  // Воспроизводит прежнюю (багованную) функцию один в один, чтобы явно
  // показать разницу с новой startOfDaysAgoLocalStr.
  const oldDaysAgoLocalISO = (days: number, now: Date): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  function pad(n: number) {
    return String(n).padStart(2, '0');
  }

  it('старая граница — это "вчера в текущее время", а не "сегодня в полночь"', () => {
    const noon = new Date(2026, 7, 4, 12, 0, 0);
    // Старое поведение (баг):
    expect(oldDaysAgoLocalISO(1, noon)).toBe('2026-08-03 12:00:00');
    // Из-за этого "created_at >= вчера-12:00" ловил хвост вчерашнего дня
    // (12:00–23:59:59, то есть половину суток) вместе с сегодняшним.
    // Новое поведение (фикс):
    expect(startOfDaysAgoLocalStr(1, noon)).toBe('2026-08-04 00:00:00');
  });
});
