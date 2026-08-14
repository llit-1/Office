import { describe, expect, it } from "vitest";
import { resolveSelectedVideoName } from "../../Pages/VideoDevices/videoDevices.utils";

describe("resolveSelectedVideoName", () => {
  it("сопоставляет сохранённое видео с доступным без учёта регистра и краевых пробелов", () => {
    expect(resolveSelectedVideoName("  Promo.MP4 ", ["promo.mp4", "menu.mp4"])).toBe("promo.mp4");
  });

  it("сохраняет выбранное имя, если видео больше нет в библиотеке", () => {
    expect(resolveSelectedVideoName("old-video.mp4", ["new-video.mp4"])).toBe("old-video.mp4");
  });

  it("возвращает пустое значение, когда видео не выбрано", () => {
    expect(resolveSelectedVideoName(undefined, ["promo.mp4"])).toBe("");
  });
});
