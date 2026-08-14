import fs from "node:fs";
import path from "node:path";

const sourceRoot = path.resolve("src");
const allowedColorFiles = new Set([
  path.resolve("src/styles/color-inventory.css"),
  path.resolve("src/styles/design-tokens.css"),
]);
const contentMetricFiles = new Set([
  path.resolve("src/Components/OfficeViewer/OfficeViewer.module.css"),
]);
const allowedScriptColorFiles = new Set([
  path.resolve("src/Components/OfficeViewer/docx.ts"),
  path.resolve("src/Components/OfficeViewer/excelColors.ts"),
]);

const files = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(fullPath);
    else if (entry.name.endsWith(".css")) files.push(fullPath);
  }
};
visit(sourceRoot);

const scriptFiles = [];
const visitScripts = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "tests") visitScripts(fullPath);
    } else if (/\.tsx?$/.test(entry.name)) {
      scriptFiles.push(fullPath);
    }
  }
};
visitScripts(sourceRoot);

const errors = [];
const warnings = [];
const addMatches = (file, source, regex, message, collection = errors) => {
  for (const match of source.matchAll(regex)) {
    const line = source.slice(0, match.index).split("\n").length;
    collection.push(`${path.relative(process.cwd(), file)}:${line} — ${message}`);
  }
};

for (const file of files) {
  const css = fs.readFileSync(file, "utf8");
  addMatches(file, css, /transition\s*:\s*(?:all\b|[^;]*\ball\b)[^;]*;/g, "использован transition: all");
  addMatches(file, css, /font-size\s*:\s*(?:[0-9]|1[01])(?:\.\d+)?px\s*;/g, "размер текста меньше 12px");

  if (!allowedColorFiles.has(file)) {
    addMatches(file, css, /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g, "локальный цвет вне семантической палитры");
  }

  for (const block of css.matchAll(/([^{}]*:hover[^{}]*)\{([^{}]*)\}/g)) {
    if (/transform\s*:\s*(?:scale|translateY\(\s*-[^)]+\)|translate\([^,]+,\s*-[^)]+\))/g.test(block[2])) {
      const line = css.slice(0, block.index).split("\n").length;
      errors.push(`${path.relative(process.cwd(), file)}:${line} — hover меняет геометрию элемента`);
    }
  }

  const semanticActionSelector = /\.(?:primaryButton|secondaryButton|dangerButton|saveButton|cancelButton|modalButton|actionButton|action_button|secondary_button|submitButton|editSaveButton|editCancelButton|editDeleteButton|filterPrimaryButton|filterSecondaryButton|retryButton|createOrderBtn|notFoundButton|addSensorButton)\b|\.(?:modalActions|modalButtons|userEditFooter|footer)\b[^,{]*\bbutton\b/;
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].trim();
    const declarations = block[2];
    if (!semanticActionSelector.test(selector) || /:(?:hover|active|disabled|focus|focus-visible)\b|\bsvg\b/.test(selector)) continue;

    const line = css.slice(0, block.index).split("\n").length;
    for (const size of declarations.matchAll(/(?:^|;)\s*(?:height|min-height)\s*:\s*(\d+)px\s*;/g)) {
      if (![36, 40, 48].includes(Number(size[1]))) {
        errors.push(`${path.relative(process.cwd(), file)}:${line} — высота текстовой action-кнопки ${size[1]}px вне шкалы 36/40/48px`);
      }
    }

    const radius = declarations.match(/border-radius\s*:\s*([^;]+);/);
    if (radius && radius[1].trim() !== "var(--radius-control)") {
      errors.push(`${path.relative(process.cwd(), file)}:${line} — action-кнопка должна использовать var(--radius-control)`);
    }

    for (const padding of declarations.matchAll(/padding(?:-inline)?\s*:\s*([^;]+);/g)) {
      if (/(?:^|\s)20px(?:\s|$)/.test(padding[1].trim())) {
        errors.push(`${path.relative(process.cwd(), file)}:${line} — горизонтальный padding action-кнопки 20px вместо системных 12/16px`);
      }
    }
  }

  const sharedButtonContainerSelector = /\.(?:modalActions|modalButtons|saveActions|userEditFooter|footer)\b[^,{]*(?:>|\s)\s*button\b/;
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].trim();
    if (!sharedButtonContainerSelector.test(selector) || /:(?:hover|active|disabled|focus|focus-visible)\b|\bsvg\b/.test(selector)) continue;
    if (!/(?:^|;)\s*(?:background(?:-color)?|color|border(?:-radius|-color|-width)?|font(?:-size|-weight|-family)?|height|min-height|padding(?:-inline)?|transition|cursor)\s*:/m.test(block[2])) continue;
    const line = css.slice(0, block.index).split("\n").length;
    errors.push(`${path.relative(process.cwd(), file)}:${line} — action container may position Components/Button but must not restyle its visual contract`);
  }

  if (!contentMetricFiles.has(file)) {
    for (const declaration of css.matchAll(/(?:padding|margin|gap)(?:-[a-z]+)?\s*:\s*([^;{}]+);/g)) {
      for (const valueMatch of declaration[1].matchAll(/(?<![-\w])(-?\d+(?:\.\d+)?)px/g)) {
        const value = Number(valueMatch[1]);
        if (value >= 0 && value % 4 !== 0) {
          const line = css.slice(0, declaration.index).split("\n").length;
          warnings.push(`${path.relative(process.cwd(), file)}:${line} — отступ ${value}px вне 4px-сетки`);
        }
      }
    }
  }
}

for (const file of scriptFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (!allowedScriptColorFiles.has(file)) {
    addMatches(file, source, /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g, "локальный UI-цвет в TypeScript вне семантической палитры");
  }
  addMatches(file, source, /fontSize\s*:\s*(?:[0-9]|1[01])(?:\.\d+)?\b/g, "размер текста в JS-конфигурации меньше 12px");
  for (const tag of source.matchAll(/<button\b[\s\S]*?>/g)) {
    if (!/(?:styles|dashboard)\.(?:primaryButton|secondaryButton|dangerButton|saveButton|cancelButton|submitButton|actionButton|action_button|secondary_button|editSaveButton|editCancelButton|editDeleteButton|filterPrimaryButton|filterSecondaryButton|retryButton|createOrderBtn|notFoundButton|addSensorButton)\b/.test(tag[0])) continue;
    const line = source.slice(0, tag.index).split("\n").length;
    errors.push(`${path.relative(process.cwd(), file)}:${line} — semantic action must use Components/Button instead of a locally styled native button`);
  }
}

const allCss = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const definedVariables = new Set([...allCss.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
const allowedRuntimeVariables = new Set([
  "--custom-theme-text-color",
  "--custom-theme-text-color-amount",
  "--font-family",
  "--search-shell-justify",
  "--search-shell-mobile-justify",
  "--search-shell-mobile-width",
]);
for (const match of allCss.matchAll(/var\((--[\w-]+)(?:\s*,[^)]*)?\)/g)) {
  if (!definedVariables.has(match[1]) && !allowedRuntimeVariables.has(match[1])) errors.push(`не объявлена CSS-переменная ${match[1]}`);
}

const unique = (items) => [...new Set(items)];
const uniqueErrors = unique(errors);
const uniqueWarnings = unique(warnings);
if (uniqueWarnings.length) {
  console.warn(`Design audit: ${uniqueWarnings.length} предупреждений по оптическим/legacy-отступам.`);
  for (const warning of uniqueWarnings.slice(0, 20)) console.warn(`  WARN ${warning}`);
  if (uniqueWarnings.length > 20) console.warn(`  …и ещё ${uniqueWarnings.length - 20}`);
}
if (uniqueErrors.length) {
  console.error(`Design audit failed: ${uniqueErrors.length} нарушений.`);
  for (const error of uniqueErrors) console.error(`  ERROR ${error}`);
  process.exit(1);
}
console.log(`Design audit passed: ${files.length} CSS-файлов и ${scriptFiles.length} TS/TSX-файлов, критических нарушений нет.`);
