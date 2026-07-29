import { jaroWinkler, crossScriptSimilarity, tokenAwareSimilarity, tokenize } from '../textSimilarity';

describe('tokenize', () => {
  it('разбивает на слова и нормализует регистр', () => {
    expect(tokenize('рубашка Daniel')).toEqual(['рубашка', 'daniel']);
  });

  it('пустая строка -> пустой массив', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('jaroWinkler', () => {
  it('идентичные строки -> 1', () => {
    expect(jaroWinkler('daniel', 'daniel')).toBe(1);
  });

  it('совсем разные строки -> 0', () => {
    expect(jaroWinkler('daniel', 'xyzxyz')).toBe(0);
  });

  it('близкие варианты написания дают высокий, но не идеальный скор', () => {
    // "deniel" (транслит "дэниел") vs "daniel" — отличаются одной гласной
    expect(jaroWinkler('deniel', 'daniel')).toBeCloseTo(0.9, 2);
  });
});

describe('crossScriptSimilarity', () => {
  it('одинаковые строки в разных регистрах -> 1', () => {
    expect(crossScriptSimilarity('Daniel', 'daniel')).toBe(1);
  });

  it('сравнивает кириллицу и латиницу через транслитерацию', () => {
    expect(crossScriptSimilarity('Даниел', 'Daniel')).toBeGreaterThanOrEqual(0.95);
    expect(crossScriptSimilarity('Даниэл', 'Daniel')).toBeGreaterThanOrEqual(0.95);
  });

  it('явно разные слова остаются с низким скором', () => {
    expect(crossScriptSimilarity('куртка', 'слон')).toBe(0);
  });

  it('похожие по буквам, но разные слова получают умеренный (не нулевой) скор — это ожидаемое поведение fuzzy-сравнения, а не баг', () => {
    const score = crossScriptSimilarity('куртка', 'ботинки');
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.8); // не дотягивает до CONFIDENT_THRESHOLD
  });
});

describe('tokenAwareSimilarity — регресс на репортнутый баг', () => {
  const PRODUCT = 'рубашка Daniel';

  it('РЕПОРТНУТЫЙ БАГ: "Daniel" находит "рубашка Daniel" (раньше был ~0.43, ниже порога 0.5)', () => {
    expect(tokenAwareSimilarity('Daniel', PRODUCT)).toBeCloseTo(1, 2);
  });

  it('кириллические варианты тоже находят товар: "даниел"', () => {
    expect(tokenAwareSimilarity('даниел', PRODUCT)).toBeGreaterThanOrEqual(0.95);
  });

  it('кириллические варианты тоже находят товар: "Даниэл"', () => {
    expect(tokenAwareSimilarity('Даниэл', PRODUCT)).toBeGreaterThanOrEqual(0.95);
  });

  it('менее точный кириллический вариант "дэниел" всё равно проходит порог кандидата (0.5)', () => {
    const score = tokenAwareSimilarity('дэниел', PRODUCT);
    expect(score).toBeGreaterThanOrEqual(0.5); // POSSIBLE_THRESHOLD в productMatching.ts
    expect(score).toBeCloseTo(0.9, 2);
  });

  it('точное совпадение всей строки -> 1', () => {
    expect(tokenAwareSimilarity(PRODUCT, PRODUCT)).toBe(1);
  });

  it('совпадение по первому слову названия (не только по последнему)', () => {
    expect(tokenAwareSimilarity('рубашка', PRODUCT)).toBeCloseTo(1, 2);
  });

  it('НЕГАТИВНЫЙ КОНТРОЛЬ: явно другой товар не даёт уверенного авто-совпадения', () => {
    // "куртка Marat" — другое слово и другое имя, должен остаться
    // ниже CONFIDENT_THRESHOLD (0.8) из productMatching.ts
    expect(tokenAwareSimilarity('Daniel', 'куртка Marat')).toBeLessThan(0.8);
  });

  it('НЕГАТИВНЫЙ КОНТРОЛЬ: похожее, но другое слово-товар не авто-линкуется', () => {
    // "футболка" реально похожа по буквам на "рубашка", это ожидаемо
    // даёт кандидата (выше 0.5), но не должно быть уверенным авто-матчем (< 0.8)
    const score = tokenAwareSimilarity('футболка', PRODUCT);
    expect(score).toBeLessThan(0.8);
  });

  it('пустой запрос -> 0, без ошибок', () => {
    expect(tokenAwareSimilarity('', PRODUCT)).toBe(0);
    expect(tokenAwareSimilarity(PRODUCT, '')).toBe(0);
  });

  describe('короткие запросы (1-2 символа) — edge case, найденный при написании тестов', () => {
    it('легитимный короткий префикс токена всё же матчится', () => {
      // "да" — начало слова "Daniel" внутри "рубашка Daniel"
      expect(tokenAwareSimilarity('да', PRODUCT)).toBeCloseTo(0.9, 2);
    });

    it('короткая строка БЕЗ реального отношения к товару не даёт ложного совпадения', () => {
      // "ку" встречается россыпью букв где-то в длинной строке, но не является
      // началом ни одного токена — naive whole-string Jaro-Winkler на такой
      // короткой query против длинного target завышал скор (было ~0.55,
      // выше порога 0.5); должно быть 0.
      expect(tokenAwareSimilarity('ку', PRODUCT)).toBe(0);
    });
  });
});
