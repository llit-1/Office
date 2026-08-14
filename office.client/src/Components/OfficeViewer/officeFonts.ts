/** Разбор шрифтовых схем Office и перевод имён шрифтов в CSS. */

export interface FontScheme {
  major: string;
  minor: string;
}

const DEFAULT_SCHEME: FontScheme = { major: "Calibri Light", minor: "Calibri" };

/** Кириллица нередко живёт в отдельном script-варианте темы. */
function pickTypeface(root: Element | null): string | null {
  if (!root) return null;
  let latin: string | null = null;
  let cyrillic: string | null = null;

  for (let index = 0; index < root.children.length; index += 1) {
    const node = root.children[index];
    const typeface = node.getAttribute("typeface");
    if (!typeface) continue;
    if (node.localName === "latin") latin = typeface;
    else if (node.localName === "font" && node.getAttribute("script") === "Cyrl") cyrillic = typeface;
  }
  return cyrillic || latin;
}

export function parseFontScheme(doc: Document | null): FontScheme {
  if (!doc) return { ...DEFAULT_SCHEME };

  const all = doc.getElementsByTagName("*");
  let scheme: Element | null = null;
  for (let index = 0; index < all.length; index += 1) {
    if (all[index].localName === "fontScheme") { scheme = all[index]; break; }
  }
  if (!scheme) return { ...DEFAULT_SCHEME };

  let major: Element | null = null;
  let minor: Element | null = null;
  for (let index = 0; index < scheme.children.length; index += 1) {
    const node = scheme.children[index];
    if (node.localName === "majorFont") major = node;
    else if (node.localName === "minorFont") minor = node;
  }

  return {
    major: pickTypeface(major) || DEFAULT_SCHEME.major,
    minor: pickTypeface(minor) || DEFAULT_SCHEME.minor,
  };
}

/** Значение w:asciiTheme / w:hAnsiTheme -> реальное имя шрифта. */
export function resolveThemeFont(themeRef: string | null | undefined, scheme: FontScheme): string | null {
  if (!themeRef) return null;
  if (themeRef.startsWith("major")) return scheme.major;
  if (themeRef.startsWith("minor")) return scheme.minor;
  return null;
}

const SERIF = /times|georgia|cambria|garamond|antiqua|constantia|palatino|minion|serif|academy|literaturnaya|petersburg|newton|schoolbook|bookman|baskerville/i;
const MONO = /mono|courier|consolas|menlo|conso/i;

/**
 * Собирает значение font-family с родовым запасным вариантом.
 * Сам шрифт должен быть установлен в системе — иначе браузер возьмёт запасной,
 * ровно как это делает Word/Excel на машине без нужного шрифта.
 */
export function cssFontFamily(name: string | null | undefined): string | undefined {
  // Отбрасываем всё, что может вырваться из inline-стиля или из HTML-атрибута.
  const trimmed = name?.replace(/["'<>;{}\\]/g, "").trim();
  if (!trimmed) return undefined;

  const generic = MONO.test(trimmed) ? "monospace" : SERIF.test(trimmed) ? "serif" : "sans-serif";
  // Одинарные кавычки: значение подставляется внутрь style="…", двойные его сломают.
  const quoted = /^[\w-]+$/.test(trimmed) ? trimmed : `'${trimmed}'`;
  return `${quoted}, ${generic}`;
}
