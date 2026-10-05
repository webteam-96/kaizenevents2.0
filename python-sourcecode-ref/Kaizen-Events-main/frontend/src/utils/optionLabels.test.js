import { humanizeOptionValue } from './optionLabels';

test('slug-shaped orphan values become readable text', () => {
  expect(humanizeOptionValue('tanvi_sawant_panaji_riviera_goa_20_qty'))
    .toBe('Tanvi Sawant Panaji Riviera Goa 20 Qty');
});

test('non-slug values pass through unchanged', () => {
  expect(humanizeOptionValue('Tanvi Sawant (Goa) - 2 Qty.')).toBe('Tanvi Sawant (Goa) - 2 Qty.');
  expect(humanizeOptionValue('plainword')).toBe('plainword'); // no underscore → not a slug
  expect(humanizeOptionValue('Mixed_Case')).toBe('Mixed_Case'); // uppercase → user text, not our slug
  expect(humanizeOptionValue('')).toBe('');
  expect(humanizeOptionValue(null)).toBe(null);
  expect(humanizeOptionValue(42)).toBe(42);
});
