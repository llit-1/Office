const imagePreloadCache = new Map<string, Promise<void>>();

function ensureImagePreloadLink(src: string) {
  if (document.head.querySelector(`link[rel="preload"][as="image"][href="${src}"]`)) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = src;
  document.head.appendChild(link);
}

export function preloadImage(src: string): Promise<void> {
  if (!src) return Promise.resolve();

  const cachedPromise = imagePreloadCache.get(src);
  if (cachedPromise) return cachedPromise;

  const promise = new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;

    if (image.complete) {
      resolve();
    }
  });

  ensureImagePreloadLink(src);
  imagePreloadCache.set(src, promise);
  return promise;
}
