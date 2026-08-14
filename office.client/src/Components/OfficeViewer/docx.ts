import { cssFontFamily, parseFontScheme, resolveThemeFont, type FontScheme } from "./officeFonts";
import type { DocumentData } from "./officeViewer.types";
import { escapeHtml } from "./officeViewer.types";
import { ZipArchive } from "./zip";

const EMU_PER_PX = 9525;

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
  emf: "",
  wmf: "",
};

function children(node: Element, localName: string) {
  const result: Element[] = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child.localName === localName) result.push(child);
  }
  return result;
}

function firstChild(node: Element | null | undefined, localName: string): Element | null {
  if (!node) return null;
  for (let index = 0; index < node.children.length; index += 1) {
    if (node.children[index].localName === localName) return node.children[index];
  }
  return null;
}

function attr(node: Element | null | undefined, localName: string): string | null {
  if (!node) return null;
  for (let index = 0; index < node.attributes.length; index += 1) {
    if (node.attributes[index].localName === localName) return node.attributes[index].value;
  }
  return null;
}

function descendant(node: Element, localName: string): Element | null {
  const stack: Element[] = [node];
  while (stack.length) {
    const current = stack.pop()!;
    for (let index = 0; index < current.children.length; index += 1) {
      const child = current.children[index];
      if (child.localName === localName) return child;
      stack.push(child);
    }
  }
  return null;
}

interface RunLook {
  fontFamily?: string;
  fontSize?: number;
}

interface DocxContext {
  rels: Map<string, string>;
  images: Map<string, string>;
  headingByStyleId: Map<string, number>;
  listFormatByNumId: Map<string, string[]>;
  fontScheme: FontScheme;
  /** Оформление рана по умолчанию для документа и для каждого именованного стиля абзаца. */
  documentLook: RunLook;
  lookByStyleId: Map<string, RunLook>;
}

/** w:rFonts -> имя шрифта: явное имя приоритетнее ссылки на шрифт темы. */
function readRunFont(rPr: Element | null, scheme: FontScheme): string | undefined {
  const rFonts = firstChild(rPr, "rFonts");
  if (!rFonts) return undefined;
  const explicit = attr(rFonts, "ascii") ?? attr(rFonts, "hAnsi") ?? attr(rFonts, "cs");
  const themed = resolveThemeFont(attr(rFonts, "asciiTheme") ?? attr(rFonts, "hAnsiTheme") ?? attr(rFonts, "cstheme"), scheme);
  return cssFontFamily(explicit ?? themed);
}

function readRunLook(rPr: Element | null, scheme: FontScheme): RunLook {
  const size = Number(attr(firstChild(rPr, "sz"), "val") ?? 0);
  return { fontFamily: readRunFont(rPr, scheme), fontSize: size > 0 ? size : undefined };
}

type Block =
  | { type: "html"; html: string }
  | { type: "li"; level: number; ordered: boolean; html: string };

function halfPointToPx(value: number) {
  return Math.round((value / 2) * 1.333 * 10) / 10;
}

function renderRun(run: Element, ctx: DocxContext, inherited: RunLook): string {
  const rPr = firstChild(run, "rPr");
  let html = "";

  for (let index = 0; index < run.children.length; index += 1) {
    const node = run.children[index];
    switch (node.localName) {
      case "t":
        html += escapeHtml(node.textContent ?? "");
        break;
      case "br":
        html += "<br />";
        break;
      case "tab":
        html += '<span class="ov-tab"></span>';
        break;
      case "noBreakHyphen":
        html += "&#8209;";
        break;
      case "sym":
        html += "";
        break;
      case "drawing":
      case "pict":
      case "object": {
        const blip = descendant(node, "blip");
        const relId = blip ? attr(blip, "embed") ?? attr(blip, "link") : null;
        const url = relId ? ctx.images.get(relId) : null;
        if (url) {
          const extent = descendant(node, "extent");
          const cx = Number(attr(extent, "cx") ?? 0);
          const width = cx > 0 ? Math.round(cx / EMU_PER_PX) : 0;
          const styleAttr = width > 0 ? ` style="max-width:${Math.min(width, 900)}px"` : "";
          html += `<img class="ov-image" src="${escapeHtml(url)}" alt=""${styleAttr} />`;
        }
        break;
      }
      default:
        break;
    }
  }

  if (!html) return "";

  const styles: string[] = [];
  const color = attr(firstChild(rPr, "color"), "val");
  if (color && /^[0-9a-fA-F]{6}$/.test(color) && color.toLowerCase() !== "000000") styles.push(`color:#${color}`);
  // Шрифт и кегль документа заданы на всей странице — в ран пишем только отличия.
  const own = readRunLook(rPr, ctx.fontScheme);
  const fontFamily = own.fontFamily ?? inherited.fontFamily;
  if (fontFamily && fontFamily !== ctx.documentLook.fontFamily) styles.push(`font-family:${fontFamily}`);
  const size = own.fontSize ?? inherited.fontSize;
  if (size && size > 0 && size !== ctx.documentLook.fontSize) styles.push(`font-size:${halfPointToPx(size)}px`);
  const highlight = attr(firstChild(rPr, "highlight"), "val");
  if (highlight && highlight !== "none") styles.push(`background-color:${escapeHtml(highlight)}`);

  const isOn = (name: string) => {
    const node = firstChild(rPr, name);
    if (!node) return false;
    const value = attr(node, "val");
    return value !== "0" && value !== "false" && value !== "none";
  };

  if (isOn("b")) html = `<strong>${html}</strong>`;
  if (isOn("i")) html = `<em>${html}</em>`;
  if (isOn("u")) html = `<u>${html}</u>`;
  if (isOn("strike") || isOn("dstrike")) html = `<s>${html}</s>`;
  const vertAlign = attr(firstChild(rPr, "vertAlign"), "val");
  if (vertAlign === "superscript") html = `<sup>${html}</sup>`;
  if (vertAlign === "subscript") html = `<sub>${html}</sub>`;
  if (styles.length) html = `<span style="${escapeHtml(styles.join(";"))}">${html}</span>`;

  return html;
}

function renderInline(container: Element, ctx: DocxContext, inherited: RunLook): string {
  let html = "";
  for (let index = 0; index < container.children.length; index += 1) {
    const node = container.children[index];
    switch (node.localName) {
      case "r":
        html += renderRun(node, ctx, inherited);
        break;
      case "hyperlink": {
        const relId = attr(node, "id");
        const target = relId ? ctx.rels.get(relId) : null;
        const inner = renderInline(node, ctx, inherited);
        html += target
          ? `<a class="ov-link" href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
          : inner;
        break;
      }
      case "ins":
      case "smartTag":
      case "bookmarkStart":
        html += renderInline(node, ctx, inherited);
        break;
      case "sdt": {
        const content = firstChild(node, "sdtContent");
        if (content) html += renderInline(content, ctx, inherited);
        break;
      }
      case "del":
      case "pPr":
        break;
      default:
        break;
    }
  }
  return html;
}

function renderParagraph(paragraph: Element, ctx: DocxContext): Block {
  const pPr = firstChild(paragraph, "pPr");
  const styleId = attr(firstChild(pPr, "pStyle"), "val") ?? "";
  const numPr = firstChild(pPr, "numPr");
  const jc = attr(firstChild(pPr, "jc"), "val");

  const styleLook = ctx.lookByStyleId.get(styleId.toLowerCase());
  const paragraphLook = readRunLook(firstChild(pPr, "rPr"), ctx.fontScheme);
  const inherited: RunLook = {
    fontFamily: paragraphLook.fontFamily ?? styleLook?.fontFamily ?? ctx.documentLook.fontFamily,
    fontSize: paragraphLook.fontSize ?? styleLook?.fontSize ?? ctx.documentLook.fontSize,
  };
  const inner = renderInline(paragraph, ctx, inherited);

  const classes: string[] = [];
  if (jc === "center") classes.push("ov-center");
  else if (jc === "right") classes.push("ov-right");
  else if (jc === "both") classes.push("ov-justify");

  if (numPr) {
    const numId = attr(firstChild(numPr, "numId"), "val") ?? "";
    const level = Number(attr(firstChild(numPr, "ilvl"), "val") ?? 0) || 0;
    const formats = ctx.listFormatByNumId.get(numId) ?? [];
    const ordered = (formats[level] ?? "bullet") !== "bullet";
    return { type: "li", level, ordered, html: inner };
  }

  const headingLevel = ctx.headingByStyleId.get(styleId.toLowerCase());
  if (headingLevel) {
    const tag = `h${Math.min(6, headingLevel + 1)}`;
    return { type: "html", html: `<${tag} class="${["ov-heading", ...classes].join(" ")}">${inner || "&nbsp;"}</${tag}>` };
  }

  const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
  return { type: "html", html: `<p${classAttr}>${inner || "&nbsp;"}</p>` };
}

interface TableCell {
  html: string;
  colSpan: number;
  rowSpan: number;
  skip: boolean;
}

function renderTable(table: Element, ctx: DocxContext): string {
  const rows = children(table, "tr");
  const matrix: TableCell[][] = [];

  rows.forEach((row) => {
    const cells: TableCell[] = [];
    const rowIndex = matrix.length;
    let columnCursor = 0;

    children(row, "tc").forEach((tc) => {
      const tcPr = firstChild(tc, "tcPr");
      const colSpan = Number(attr(firstChild(tcPr, "gridSpan"), "val") ?? 1) || 1;
      const vMergeNode = firstChild(tcPr, "vMerge");
      const vMergeVal = vMergeNode ? attr(vMergeNode, "val") ?? "continue" : null;

      if (vMergeNode && vMergeVal !== "restart") {
        // Продолжение объединения — увеличиваем rowSpan верхней ячейки.
        for (let above = rowIndex - 1; above >= 0; above -= 1) {
          let cursor = 0;
          const candidate = matrix[above].find((cell) => {
            if (cursor === columnCursor) return true;
            cursor += cell.colSpan;
            return false;
          });
          if (candidate && !candidate.skip) { candidate.rowSpan += 1; break; }
        }
        cells.push({ html: "", colSpan, rowSpan: 1, skip: true });
        columnCursor += colSpan;
        return;
      }

      let html = "";
      for (let index = 0; index < tc.children.length; index += 1) {
        const node = tc.children[index];
        if (node.localName === "p") {
          const block = renderParagraph(node, ctx);
          html += block.type === "html" ? block.html : `<p>• ${block.html}</p>`;
        } else if (node.localName === "tbl") {
          html += renderTable(node, ctx);
        }
      }
      cells.push({ html: html || "<p>&nbsp;</p>", colSpan, rowSpan: 1, skip: false });
      columnCursor += colSpan;
    });

    matrix.push(cells);
  });

  const body = matrix
    .map((cells) => {
      const rendered = cells
        .filter((cell) => !cell.skip)
        .map((cell) => {
          const colSpan = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
          const rowSpan = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";
          return `<td${colSpan}${rowSpan}>${cell.html}</td>`;
        })
        .join("");
      return `<tr>${rendered}</tr>`;
    })
    .join("");

  return `<table class="ov-table"><tbody>${body}</tbody></table>`;
}

function blocksToHtml(blocks: Block[]): string {
  let html = "";
  // nested === true, если список открыт внутри <li> (вложенный уровень).
  const stack: { ordered: boolean; level: number; nested: boolean }[] = [];

  const openList = (ordered: boolean, level: number, nested: boolean) => {
    if (nested) html += '<li class="ov-nested">';
    html += ordered ? '<ol class="ov-list">' : '<ul class="ov-list">';
    stack.push({ ordered, level, nested });
  };

  const closeList = () => {
    const closed = stack.pop();
    if (!closed) return;
    html += closed.ordered ? "</ol>" : "</ul>";
    if (closed.nested) html += "</li>";
  };

  const closeTo = (level: number) => {
    while (stack.length && stack[stack.length - 1].level >= level) closeList();
  };

  for (const block of blocks) {
    if (block.type === "html") {
      closeTo(0);
      html += block.html;
      continue;
    }

    const top = stack[stack.length - 1];
    if (!top) {
      openList(block.ordered, block.level, false);
    } else if (block.level > top.level) {
      openList(block.ordered, block.level, true);
    } else if (block.level < top.level) {
      closeTo(block.level + 1);
      if (!stack.length) openList(block.ordered, block.level, false);
      else if (stack[stack.length - 1].level !== block.level) {
        openList(block.ordered, block.level, true);
      }
    } else if (top.ordered !== block.ordered) {
      const wasNested = top.nested;
      closeList();
      openList(block.ordered, block.level, wasNested);
    }

    html += `<li>${block.html || "&nbsp;"}</li>`;
  }

  closeTo(0);
  return html;
}

async function buildContext(zip: ZipArchive): Promise<DocxContext> {
  const rels = new Map<string, string>();
  const images = new Map<string, string>();
  const headingByStyleId = new Map<string, number>();
  const listFormatByNumId = new Map<string, string[]>();
  const lookByStyleId = new Map<string, RunLook>();
  const fontScheme = parseFontScheme(await zip.readXml("word/theme/theme1.xml"));
  let documentLook: RunLook = {};

  const relsDoc = await zip.readXml("word/_rels/document.xml.rels");
  if (relsDoc) {
    const nodes = relsDoc.getElementsByTagName("Relationship");
    for (let index = 0; index < nodes.length; index += 1) {
      const id = nodes[index].getAttribute("Id");
      const target = nodes[index].getAttribute("Target");
      const mode = nodes[index].getAttribute("TargetMode");
      if (!id || !target) continue;
      if (mode === "External") { rels.set(id, target); continue; }
      rels.set(id, target);

      const path = target.startsWith("/") ? target.slice(1) : `word/${target.replace(/^\.\.\//, "")}`;
      const extension = path.split(".").pop()?.toLowerCase() ?? "";
      const mime = IMAGE_MIME[extension];
      if (!mime) continue;
      const bytes = await zip.readBytes(path);
      if (!bytes) continue;
      images.set(id, URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime })));
    }
  }

  const stylesDoc = await zip.readXml("word/styles.xml");
  if (stylesDoc) {
    const nodes = stylesDoc.getElementsByTagName("*");
    let defaultStyleId = "";

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];

      if (node.localName === "rPrDefault") {
        documentLook = readRunLook(firstChild(node, "rPr"), fontScheme);
        continue;
      }
      if (node.localName !== "style") continue;

      const styleId = attr(node, "styleId") ?? "";
      const name = attr(firstChild(node, "name"), "val") ?? "";
      const match = /^heading\s*(\d)/i.exec(name) || /^заголовок\s*(\d)/i.exec(name) || /^heading(\d)$/i.exec(styleId);
      if (match) headingByStyleId.set(styleId.toLowerCase(), Number(match[1]));

      const look = readRunLook(firstChild(node, "rPr"), fontScheme);
      if (look.fontFamily || look.fontSize) lookByStyleId.set(styleId.toLowerCase(), look);
      if (attr(node, "default") === "1" && attr(node, "type") === "paragraph") defaultStyleId = styleId.toLowerCase();
    }

    // Стиль «Обычный» задаёт шрифт для абзацев без явного pStyle.
    const defaultStyleLook = lookByStyleId.get(defaultStyleId);
    documentLook = {
      fontFamily: defaultStyleLook?.fontFamily ?? documentLook.fontFamily,
      fontSize: defaultStyleLook?.fontSize ?? documentLook.fontSize,
    };
  }

  const numberingDoc = await zip.readXml("word/numbering.xml");
  if (numberingDoc) {
    const abstractFormats = new Map<string, string[]>();
    const all = numberingDoc.getElementsByTagName("*");
    for (let index = 0; index < all.length; index += 1) {
      const node = all[index];
      if (node.localName === "abstractNum") {
        const id = attr(node, "abstractNumId") ?? "";
        const formats: string[] = [];
        children(node, "lvl").forEach((lvl) => {
          const level = Number(attr(lvl, "ilvl") ?? 0) || 0;
          formats[level] = attr(firstChild(lvl, "numFmt"), "val") ?? "bullet";
        });
        abstractFormats.set(id, formats);
      }
    }
    for (let index = 0; index < all.length; index += 1) {
      const node = all[index];
      if (node.localName !== "num") continue;
      const numId = attr(node, "numId") ?? "";
      const abstractId = attr(firstChild(node, "abstractNumId"), "val") ?? "";
      listFormatByNumId.set(numId, abstractFormats.get(abstractId) ?? []);
    }
  }

  return { rels, images, headingByStyleId, listFormatByNumId, fontScheme, documentLook, lookByStyleId };
}

export async function readDocx(buffer: ArrayBuffer): Promise<DocumentData> {
  const zip = ZipArchive.open(buffer);
  const documentXml = await zip.readXml("word/document.xml");
  if (!documentXml) throw new Error("Не удалось прочитать документ Word.");

  const ctx = await buildContext(zip);
  const body = documentXml.getElementsByTagName("*");
  let bodyElement: Element | null = null;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index].localName === "body") { bodyElement = body[index]; break; }
  }
  if (!bodyElement) throw new Error("Документ Word пуст или повреждён.");

  const blocks: Block[] = [];
  const walk = (container: Element) => {
    for (let index = 0; index < container.children.length; index += 1) {
      const node = container.children[index];
      if (node.localName === "p") blocks.push(renderParagraph(node, ctx));
      else if (node.localName === "tbl") blocks.push({ type: "html", html: renderTable(node, ctx) });
      else if (node.localName === "sdt") {
        const content = firstChild(node, "sdtContent");
        if (content) walk(content);
      }
    }
  };
  walk(bodyElement);

  return {
    kind: "document",
    html: blocksToHtml(blocks),
    objectUrls: [...ctx.images.values()],
    fontFamily: ctx.documentLook.fontFamily,
    fontSize: ctx.documentLook.fontSize ? halfPointToPx(ctx.documentLook.fontSize) : undefined,
  };
}
