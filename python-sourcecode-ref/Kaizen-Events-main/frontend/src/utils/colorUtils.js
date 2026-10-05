// Converts a #rrggbb (or #rgb) hex color to an rgba() string with the given alpha.
// Used to tint a background image with the theme's background color so text/fields
// on top of it stay readable.
export const hexToRgba = (hex, alpha = 1) => {
  if (!hex || typeof hex !== 'string') return `rgba(255, 255, 255, ${alpha})`;
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  if (full.length !== 6 || isNaN(int)) return `rgba(255, 255, 255, ${alpha})`;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
