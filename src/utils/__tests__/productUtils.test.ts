import { buildVariantDisplayName, compareSizes } from '../productUtils';

describe('productUtils', () => {
  describe('buildVariantDisplayName', () => {
    it('joins name, color, and size with middle dots when all are present', () => {
      expect(buildVariantDisplayName('Костюм', 'Синий', '48')).toBe('Костюм · Синий · 48');
    });

    it('joins only present fields', () => {
      expect(buildVariantDisplayName('Костюм', 'Синий', null)).toBe('Костюм · Синий');
      expect(buildVariantDisplayName('Костюм', null, '50')).toBe('Костюм · 50');
      expect(buildVariantDisplayName('Костюм', '', '')).toBe('Костюм');
    });

    it('handles whitespace trimming', () => {
      expect(buildVariantDisplayName('  Платье ', ' Красный  ', ' L ')).toBe('Платье · Красный · L');
    });
  });

  describe('compareSizes', () => {
    it('sorts numeric sizes numerically', () => {
      const sizes = ['42', '9', '38', '10', '40'];
      sizes.sort(compareSizes);
      expect(sizes).toEqual(['9', '10', '38', '40', '42']);
    });

    it('sorts canonical letter sizes in sequence', () => {
      const sizes = ['XL', 'S', '3XL', 'M', 'XS'];
      sizes.sort(compareSizes);
      expect(sizes).toEqual(['XS', 'S', 'M', 'XL', '3XL']);
    });

    it('handles null/empty values gracefully', () => {
      expect(compareSizes(null, 'M')).toBe(1);
      expect(compareSizes('M', null)).toBe(-1);
      expect(compareSizes(null, null)).toBe(0);
    });
  });
});
