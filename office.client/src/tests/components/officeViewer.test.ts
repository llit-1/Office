import { describe, expect, it } from "vitest";
import { detectTableWidth } from "../../Components/OfficeViewer/docLegacy";
import { readDocx } from "../../Components/OfficeViewer/docx";
import { parseThemePalette, resolveBorder, resolveColor } from "../../Components/OfficeViewer/excelColors";
import { cssFontFamily, parseFontScheme, resolveThemeFont } from "../../Components/OfficeViewer/officeFonts";
import { formatExcelDate, decodeRk, formatNumber, resolveFormatCode } from "../../Components/OfficeViewer/numberFormat";
import { getOfficeViewerFormat } from "../../Components/OfficeViewer/officeFormats";
import { readCsv, readXlsx } from "../../Components/OfficeViewer/xlsx";
import { ZipArchive } from "../../Components/OfficeViewer/zip";
import { FILE_KIND_LABEL, getFileKind } from "../../Components/FileTypeIcon/fileTypes";

/** Собирает ZIP без сжатия (method 0) — достаточно для проверки ридера и парсеров. */
function buildStoredZip(files: Record<string, string>): ArrayBuffer {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, 0, true); // stored
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, centrals.length, true);
  eocdView.setUint16(10, centrals.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of [...locals, ...centrals, eocd]) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output.buffer;
}

const XLSX_FILES = {
  "xl/workbook.xml": `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Отчёт" sheetId="1" r:id="rId1"/><sheet name="Скрытый" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Наименование</t></si><si><r><t>Товар </t></r><r><t>№1</t></r></si></sst>`,
  "xl/theme/theme1.xml": `<?xml version="1.0"?>
<theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><themeElements>
<fontScheme><majorFont><latin typeface="PT Sans Caption"/></majorFont>
<minorFont><latin typeface="Calibri"/><font script="Cyrl" typeface="PT Astra Serif"/></minorFont></fontScheme>
</themeElements></theme>`,
  "xl/styles.xml": `<?xml version="1.0"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts><font><sz val="11"/><name val="Times New Roman"/></font><font><b/><name val="Arial Narrow"/></font><font><scheme val="minor"/></font></fonts>
<cellXfs><xf numFmtId="0" fontId="0"/><xf numFmtId="0" fontId="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0"/><xf numFmtId="14" fontId="0"/><xf numFmtId="0" fontId="2"/><xf numFmtId="0" fontId="0"><alignment textRotation="90"/></xf></cellXfs></styleSheet>`,
  "xl/worksheets/sheet1.xml": `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetFormatPr defaultRowHeight="12.75"/>
<cols><col min="1" max="1" width="30"/></cols>
<sheetData>
<row r="1"><c r="A1" t="s" s="1"><v>0</v></c><c r="B1" s="1"/><c r="C1" s="1"/></row>
<row r="2" ht="30"><c r="A2" t="s"><v>1</v></c><c r="B2" s="2"><v>1234.5</v></c><c r="C2" s="3"><v>45000</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Итого</t></is></c><c r="B3" t="b"><v>1</v></c><c r="C3" t="inlineStr" s="4"><is><t>Тема</t></is></c></row>
<row r="4"><c r="A4" t="inlineStr" s="5"><is><t>Вертикально</t></is></c></row>
</sheetData><mergeCells><mergeCell ref="A1:C1"/></mergeCells></worksheet>`,
  "xl/worksheets/sheet2.xml": `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
};

const DOCX_FILES = {
  "word/document.xml": `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Инструкция</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Жирный </w:t></w:r><w:r><w:t>и &lt;тег&gt;</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Пункт</w:t></w:r></w:p>
<w:p><w:hyperlink r:id="rIdLink"><w:r><w:t>ссылка</w:t></w:r></w:hyperlink></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="Courier New"/></w:rPr><w:t>моно</w:t></w:r><w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/></w:rPr><w:t>тема</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Шапка</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`,
  "word/_rels/document.xml.rels": `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>`,
  "word/theme/theme1.xml": `<?xml version="1.0"?>
<theme><themeElements><fontScheme><majorFont><latin typeface="PT Sans Caption"/></majorFont>
<minorFont><latin typeface="Calibri"/><font script="Cyrl" typeface="PT Astra Serif"/></minorFont></fontScheme></themeElements></theme>`,
  "word/styles.xml": `<?xml version="1.0"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
  "word/numbering.xml": `<?xml version="1.0"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
};

describe("zip reader", () => {
  it("reads stored entries and parses xml", async () => {
    const zip = ZipArchive.open(buildStoredZip({ "a/b.xml": "<root><child>значение</child></root>" }));
    expect(zip.names()).toEqual(["a/b.xml"]);
    const xml = await zip.readXml("a/b.xml");
    expect(xml?.getElementsByTagName("child")[0].textContent).toBe("значение");
    expect(await zip.readBytes("нет.xml")).toBeNull();
  });
});

describe("number formatting", () => {
  it("uses the russian decimal separator and grouping", () => {
    expect(formatNumber(1234.5, 164, "#,##0.00")).toBe("1\u00a0234,50");
    expect(formatNumber(0.25, 0, "General")).toBe("0,25");
    expect(formatNumber(1000000, 0, "General")).toBe("1000000");
    expect(formatNumber(0.5, 9, "0%")).toBe("50%");
  });

  it("converts excel serial dates", () => {
    expect(formatExcelDate(45000, "dd.mm.yyyy")).toBe("15.03.2023");
    expect(formatNumber(45000, 14, resolveFormatCode(14, new Map()))).toBe("15.03.2023");
  });

  it("decodes rk values", () => {
    expect(decodeRk((100 << 2) | 0x02)).toBe(100);
    expect(decodeRk((12345 << 2) | 0x03)).toBeCloseTo(123.45, 5);
  });
});

describe("xlsx reader", () => {
  it("reads sheets, styles, merges and skips hidden sheets", async () => {
    const workbook = await readXlsx(buildStoredZip(XLSX_FILES));
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(["Отчёт"]);

    const [sheet] = workbook.sheets;
    expect(sheet.rows[0][0].text).toBe("Наименование");
    expect(sheet.rows[0][0].bold).toBe(true);
    expect(sheet.rows[0][0].align).toBe("center");
    expect(sheet.rows[0][0].colSpan).toBe(3);
    expect(sheet.rows[0][1].hidden).toBe(true);

    expect(sheet.rows[1][0].text).toBe("Товар №1");
    expect(sheet.rows[1][1].text).toBe("1\u00a0234,50");
    expect(sheet.rows[1][2].text).toBe("15.03.2023");
    expect(sheet.rows[2][0].text).toBe("Итого");
    expect(sheet.rows[2][1].text).toBe("ИСТИНА");
  });

  it("keeps the fonts declared in the workbook", async () => {
    const [sheet] = (await readXlsx(buildStoredZip(XLSX_FILES))).sheets;
    // Базовый шрифт листа = шрифт первой записи cellXfs (стиль «Обычный»).
    expect(sheet.defaultFont).toBe("'Times New Roman', serif");
    expect(sheet.rows[0][0].fontFamily).toBe("'Arial Narrow', sans-serif");
    // Ячейка без атрибута s наследует стиль 0, то есть базовый шрифт — отдельно его не пишем.
    expect(sheet.rows[1][0].fontFamily).toBeUndefined();
    // scheme="minor" без явного имени -> кириллический шрифт темы.
    expect(sheet.rows[2][2].fontFamily).toBe("'PT Astra Serif', serif");
  });

  it("converts excel geometry to pixels", async () => {
    const [sheet] = (await readXlsx(buildStoredZip(XLSX_FILES))).sheets;
    // 12.75пт при 96 dpi = 17px — стандартная высота строки Excel.
    expect(sheet.defaultRowHeight).toBe(17);
    expect(sheet.rowHeights?.[1]).toBe(40); // ht="30"
    // Ширина 30 «нулей» шрифта Times New Roman 11пт.
    expect(sheet.columnWidths?.[0]).toBe(240);
    expect(sheet.defaultColumnWidth).toBe(67);
  });

  it("keeps text rotation", async () => {
    const [sheet] = (await readXlsx(buildStoredZip(XLSX_FILES))).sheets;
    expect(sheet.rows[3][0].rotation).toBe(90);
    expect(sheet.rows[2][0].rotation).toBeUndefined();
  });
});

describe("csv reader", () => {
  it("detects the delimiter and respects quotes", () => {
    const workbook = readCsv('Имя;Сумма\n"Товар; шт";1000\nБ;2', "x.csv");
    expect(workbook.sheets[0].rows.map((row) => row.map((cell) => cell.text))).toEqual([
      ["Имя", "Сумма"],
      ["Товар; шт", "1000"],
      ["Б", "2"],
    ]);
  });
});

describe("docx reader", () => {
  it("renders headings, runs, lists, links and tables and escapes markup", async () => {
    const { html } = await readDocx(buildStoredZip(DOCX_FILES));
    expect(html).toContain("<h2 class=\"ov-heading\">Инструкция</h2>");
    expect(html).toContain("<strong>Жирный </strong>");
    expect(html).toContain("&lt;тег&gt;");
    expect(html).not.toContain("<тег>");
    expect(html).toContain("<ol class=\"ov-list\"><li>Пункт</li></ol>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('<td colspan="2">');
  });

  it("resolves fonts from doc defaults, styles, runs and the theme", async () => {
    const document = await readDocx(buildStoredZip(DOCX_FILES));
    // Стиль "Normal" перекрывает docDefaults; 24 полупункта = 12пт = 16px.
    expect(document.fontFamily).toBe("'Times New Roman', serif");
    expect(document.fontSize).toBe(16);
    expect(document.html).toContain("font-family:&#39;Courier New&#39;, monospace");
    expect(document.html).toContain("font-family:&#39;PT Astra Serif&#39;, serif");
    // Кавычки экранированы — иначе имя шрифта разорвало бы атрибут style.
    expect(document.html).not.toContain('style="font-family:\'');
  });
});

describe("excel colors", () => {
  const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml").documentElement;

  it("resolves rgb, indexed and theme colors with tint", () => {
    const palette = parseThemePalette(
      new DOMParser().parseFromString(
        `<theme xmlns:a="x"><themeElements><clrScheme><dk1><srgbClr val="1A1A1A"/></dk1><lt1><sysClr val="window" lastClr="FFFFFF"/></lt1><accent1><srgbClr val="4472C4"/></accent1></clrScheme></themeElements></theme>`,
        "application/xml",
      ),
    );

    expect(resolveColor(parse('<color rgb="FFCE1126"/>'), palette)).toBe("#CE1126");
    expect(resolveColor(parse('<color rgb="00FF0000"/>'), palette)).toBeNull(); // полностью прозрачный
    expect(resolveColor(parse('<color indexed="2"/>'), palette)).toBe("#FF0000");
    expect(resolveColor(parse('<color indexed="64"/>'), palette)).toBeNull(); // системный «авто»
    expect(resolveColor(parse('<color theme="4"/>'), palette)).toBe("#4472C4");
    expect(resolveColor(parse('<color theme="1"/>'), palette)).toBe("#1A1A1A");
    expect(resolveColor(parse('<color auto="1"/>'), palette)).toBeNull();
    expect(resolveColor(null, palette)).toBeNull();

    const tinted = resolveColor(parse('<color theme="4" tint="0.6"/>'), palette);
    expect(tinted).toMatch(/^#[0-9A-F]{6}$/);
    expect(tinted).not.toBe("#4472C4");
  });

  it("builds css borders", () => {
    const palette = parseThemePalette(null);
    expect(resolveBorder(parse('<top style="thin"><color rgb="FFBFBFBF"/></top>'), palette)).toBe("1px solid #BFBFBF");
    expect(resolveBorder(parse('<top style="medium"/>'), palette)).toBe("2px solid #000000");
    expect(resolveBorder(parse('<top style="none"/>'), palette)).toBeNull();
    expect(resolveBorder(parse("<top/>"), palette)).toBeNull();
  });
});

describe("office fonts", () => {
  it("adds a generic fallback and quotes names safely for inline styles", () => {
    expect(cssFontFamily("Times New Roman")).toBe("'Times New Roman', serif");
    expect(cssFontFamily("Arial")).toBe("Arial, sans-serif");
    expect(cssFontFamily("Consolas")).toBe("Consolas, monospace");
    expect(cssFontFamily("  Cambria  ")).toBe("Cambria, serif");
    expect(cssFontFamily(undefined)).toBeUndefined();
    expect(cssFontFamily("   ")).toBeUndefined();
    // Кавычки и разделители не должны вырваться из style="…"
    expect(cssFontFamily('Evil"; background:url(x); font-family:"y')).toBe("'Evil background:url(x) font-family:y', sans-serif");
  });

  it("prefers the cyrillic typeface of the theme scheme", () => {
    const scheme = parseFontScheme(
      new DOMParser().parseFromString(
        `<theme><themeElements><fontScheme>
          <majorFont><latin typeface="PT Sans Caption"/></majorFont>
          <minorFont><latin typeface="Calibri"/><font script="Cyrl" typeface="PT Astra Serif"/></minorFont>
        </fontScheme></themeElements></theme>`,
        "application/xml",
      ),
    );
    expect(scheme).toEqual({ major: "PT Sans Caption", minor: "PT Astra Serif" });
    expect(resolveThemeFont("minorHAnsi", scheme)).toBe("PT Astra Serif");
    expect(resolveThemeFont("majorAscii", scheme)).toBe("PT Sans Caption");
    expect(resolveThemeFont(null, scheme)).toBeNull();
    expect(parseFontScheme(null)).toEqual({ major: "Calibri Light", minor: "Calibri" });
  });
});

describe("legacy doc tables", () => {
  it("infers the row width from the trailing empty cell of every row", () => {
    // 2 колонки: [c, c, конецСтроки] x 2
    expect(detectTableWidth(["A", "B", "", "C", "D", ""])).toBe(2);
    // 3 колонки x 3 строки — наивный подбор дал бы 2
    expect(detectTableWidth(["a", "b", "c", "", "d", "e", "f", "", "g", "h", "i", ""])).toBe(3);
    // каркасная таблица с пустой первой колонкой
    expect(detectTableWidth(["", "", "", "Заголовок", "", "", "", "Текст", ""])).toBe(2);
    expect(detectTableWidth(["Одна", "", "Две", ""])).toBe(1);
  });
});

describe("file type detection", () => {
  it("maps extensions to kinds", () => {
    expect(getFileKind(".xlsx")).toBe("excel");
    expect(getFileKind(".DOCX")).toBe("word");
    expect(getFileKind("pptx")).toBe("powerpoint");
    expect(getFileKind(".mp4")).toBe("video");
    expect(getFileKind(".zip")).toBe("archive");
    expect(getFileKind(".unknown")).toBe("other");
    expect(getFileKind(".pdf", true)).toBe("folder");
    expect(FILE_KIND_LABEL[getFileKind(".xls")]).toBe("Таблица Excel");
  });

  it("knows which formats the viewer can render", () => {
    expect(getOfficeViewerFormat(".docx")).toBe("docx");
    expect(getOfficeViewerFormat(".xls")).toBe("xls");
    expect(getOfficeViewerFormat(".pdf")).toBeNull();
  });
});
