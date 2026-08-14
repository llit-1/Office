const FONT_LOAD_TIMEOUT_MS = 2500;
const FONT_VARIANTS = [
  "350 1rem 'Roboto Condensed Variable'",
  "500 1rem 'Roboto Condensed Variable'",
  "700 1rem 'Roboto Condensed Variable'",
  "400 1rem Akrobat",
  "600 1rem Akrobat",
  "700 1rem Akrobat",
];

function waitForTimeout(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}

export async function warmUpFonts() {
  if (typeof document === "undefined" || !("fonts" in document)) {
    return;
  }

  try {
    const fontSet = document.fonts;
    const loadPromise = Promise.allSettled(
      FONT_VARIANTS.map((font) => fontSet.load(font)),
    ).then(() => fontSet.ready);

    await Promise.race([loadPromise, waitForTimeout(FONT_LOAD_TIMEOUT_MS)]);
  } catch {
    // Ignore font API failures and keep app startup resilient.
  }
}
