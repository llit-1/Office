import type { RkCategory, RkMenuOption } from "./deliveryMenu.types";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const PRICE_STORAGE_FACTOR = 100;

function bytesToBase64(bytes: number[]) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return window.btoa(binary);
}

function detectImageMime(base64: string) {
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/jpeg";
}

export function getImageSource(image?: string | number[] | null) {
  if (!image || (Array.isArray(image) && image.length === 0)) return null;
  const base64 = getImageBase64(image);
  if (base64.startsWith("data:")) return base64;
  return `data:${detectImageMime(base64)};base64,${base64}`;
}

export function getImageBase64(image?: string | number[] | null) {
  if (!image) return "";
  const value = Array.isArray(image) ? bytesToBase64(image) : image;
  return value.includes(",") && value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
}

export function readImageFile(file: File): Promise<{ base64: string; preview: string }> {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Выберите изображение в формате JPG, PNG или WebP."));
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return Promise.reject(new Error("Размер изображения не должен превышать 8 МБ."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const preview = String(reader.result ?? "");
      const base64 = preview.includes(",") ? preview.slice(preview.indexOf(",") + 1) : preview;
      resolve({ base64, preview });
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
    reader.readAsDataURL(file);
  });
}

export function flattenRkCategories(categories: RkCategory[], parentPath: string[] = []): RkMenuOption[] {
  return categories.flatMap((category) => {
    const currentPath = [...parentPath, category.name];
    const ownItems = (category.items ?? []).map((item) => ({
      ...item,
      categoryPath: currentPath.join(" / "),
    }));
    return [...ownItems, ...flattenRkCategories(category.categories ?? [], currentPath)];
  });
}

export function toDisplayPrice(price: number) {
  const normalizedPrice = Number(price);
  return Number.isFinite(normalizedPrice) ? normalizedPrice / PRICE_STORAGE_FACTOR : 0;
}

function normalizePrice(price: number) {
  const normalizedPrice = Number(price);
  return Number.isFinite(normalizedPrice) ? normalizedPrice : 0;
}

export function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(normalizePrice(price));
}

export function formatRkPrice(price: number) {
  return formatPrice(toDisplayPrice(price));
}

export function formatMeasureUnit(unit?: string | number | null): "гр" | "мл" {
  const normalizedUnit = String(unit ?? "").trim().toLocaleLowerCase("ru-RU");
  return normalizedUnit === "2" || normalizedUnit === "мл" ? "мл" : "гр";
}
