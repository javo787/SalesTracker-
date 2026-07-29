import { cyrillicToLatin, containsCyrillic } from '../transliteration';

describe('cyrillicToLatin', () => {
  it('транслитерирует кириллические варианты имени в одну и ту же латинскую форму', () => {
    expect(cyrillicToLatin('Даниел')).toBe('daniel');
    expect(cyrillicToLatin('Даниэл')).toBe('daniel');
  });

  it('даёт близкий, но не обязательно идентичный результат для другого написания', () => {
    // "дэниел" отличается от "даниел"/"даниэл" гласной во 2-м слоге —
    // это ожидаемо и добирается через fuzzy-сравнение (jaroWinkler),
    // а не через транслитерацию саму по себе.
    expect(cyrillicToLatin('дэниел')).toBe('deniel');
  });

  it('не трогает латинские символы', () => {
    expect(cyrillicToLatin('Daniel')).toBe('daniel'); // только lowercase
    expect(cyrillicToLatin('рубашка Daniel')).toBe('rubashka daniel');
  });

  it('обрабатывает буквы таджикской/узбекской кириллицы', () => {
    expect(cyrillicToLatin('ғ')).toBe('g');
    expect(cyrillicToLatin('қ')).toBe('q');
    expect(cyrillicToLatin('ҳ')).toBe('h');
    expect(cyrillicToLatin('ҷ')).toBe('j');
  });
});

describe('containsCyrillic', () => {
  it('true для кириллицы, false для чистой латиницы', () => {
    expect(containsCyrillic('Даниел')).toBe(true);
    expect(containsCyrillic('рубашка Daniel')).toBe(true); // смешанная строка
    expect(containsCyrillic('Daniel')).toBe(false);
    expect(containsCyrillic('')).toBe(false);
  });
});
