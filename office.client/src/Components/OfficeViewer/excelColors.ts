/** Разбор цветов Excel: rgb / indexed / theme + tint. */

/** Стандартная палитра индексированных цветов (BIFF8 / OOXML legacy). */
const INDEXED_COLORS = [
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080",
  "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
  "000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF",
  "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
  "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696",
  "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333",
];

/** Порядок цветов темы в Excel (индексы 0..11). */
const THEME_ORDER = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];

const DEFAULT_THEME: Record<string, string> = {
  dk1: "000000", lt1: "FFFFFF", dk2: "44546A", lt2: "E7E6E6",
  accent1: "4472C4", accent2: "ED7D31", accent3: "A5A5A5",
  accent4: "FFC000", accent5: "5B9BD5", accent6: "70AD47",
  hlink: "0563C1", folHlink: "954F72",
};

export type ThemePalette = Record<string, string>;

export function parseThemePalette(doc: Document | null): ThemePalette {
  const palette: ThemePalette = { ...DEFAULT_THEME };
  if (!doc) return palette;

  const all = doc.getElementsByTagName("*");
  let scheme: Element | null = null;
  for (let index = 0; index < all.length; index += 1) {
    if (all[index].localName === "clrScheme") { scheme = all[index]; break; }
  }
  if (!scheme) return palette;

  for (let index = 0; index < scheme.children.length; index += 1) {
    const node = scheme.children[index];
    const child = node.children[0];
    if (!child) continue;
    const value = child.getAttribute("val") ?? child.getAttribute("lastClr");
    if (value && /^[0-9a-fA-F]{6}$/.test(value)) palette[node.localName] = value.toUpperCase();
  }
  return palette;
}

function rgbToHsl(hex: string) {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;
  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) {
    const value = Math.round(l * 255);
    return [value, value, value];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toChannel = (t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return [toChannel(h + 1 / 3), toChannel(h), toChannel(h - 1 / 3)].map((value) => Math.round(value * 255));
}

function applyTint(hex: string, tint: number) {
  if (!tint) return hex;
  const { h, s, l } = rgbToHsl(hex);
  const lightness = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const [r, g, b] = hslToRgb(h, s, Math.min(1, Math.max(0, lightness)));
  return [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Возвращает цвет вида "#RRGGBB" либо null, если цвет не задан или автоматический. */
export function resolveColor(node: Element | null | undefined, palette: ThemePalette): string | null {
  if (!node) return null;
  if (node.getAttribute("auto") === "1") return null;

  const tint = Number(node.getAttribute("tint") ?? 0) || 0;

  const rgb = node.getAttribute("rgb");
  if (rgb && /^[0-9a-fA-F]{6,8}$/.test(rgb)) {
    const hex = rgb.length === 8 ? rgb.slice(2) : rgb;
    const alpha = rgb.length === 8 ? parseInt(rgb.slice(0, 2), 16) : 255;
    if (alpha === 0) return null;
    return `#${applyTint(hex.toUpperCase(), tint)}`;
  }

  const themeIndex = node.getAttribute("theme");
  if (themeIndex !== null) {
    const key = THEME_ORDER[Number(themeIndex)];
    const base = (key && palette[key]) || DEFAULT_THEME.dk1;
    return `#${applyTint(base, tint)}`;
  }

  const indexed = node.getAttribute("indexed");
  if (indexed !== null) {
    const index = Number(indexed);
    if (index === 64 || index === 65) return null; // системные "авто"
    const base = INDEXED_COLORS[index];
    if (base) return `#${applyTint(base, tint)}`;
  }

  return null;
}

const BORDER_WIDTH: Record<string, string> = {
  hair: "1px", thin: "1px", medium: "2px", thick: "3px",
  dotted: "1px", dashed: "1px", dashDot: "1px", dashDotDot: "1px",
  mediumDashed: "2px", mediumDashDot: "2px", mediumDashDotDot: "2px", slantDashDot: "2px",
  double: "3px",
};

const BORDER_STYLE: Record<string, string> = {
  hair: "solid", thin: "solid", medium: "solid", thick: "solid",
  dotted: "dotted", dashed: "dashed", dashDot: "dashed", dashDotDot: "dashed",
  mediumDashed: "dashed", mediumDashDot: "dashed", mediumDashDotDot: "dashed",
  slantDashDot: "dashed", double: "double",
};

export function resolveBorder(node: Element | null | undefined, palette: ThemePalette): string | null {
  if (!node) return null;
  const style = node.getAttribute("style");
  if (!style || style === "none") return null;
  const color = resolveColor(node.getElementsByTagName("color")[0] ?? null, palette) ?? "#000000";
  return `${BORDER_WIDTH[style] ?? "1px"} ${BORDER_STYLE[style] ?? "solid"} ${color}`;
}
