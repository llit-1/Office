import { describe, expect, it } from "vitest";
import {
  formatKnowledgeFileSize,
  getKnowledgeBackPath,
  getKnowledgeBreadcrumbs,
  getKnowledgeLibraryHref,
  getKnowledgePathSegments,
  getKnowledgePreviewType,
  getParentKnowledgePath,
} from "../../Pages/KnowledgeLibrary/knowledgeLibrary.utils";

describe("knowledgeLibrary utils", () => {
  it("builds breadcrumbs for deeply nested folders", () => {
    expect(getKnowledgeBreadcrumbs("Обучение/Продавцы/Видео")).toEqual([
      { label: "Обучение", path: "Обучение" },
      { label: "Продавцы", path: "Обучение/Продавцы" },
      { label: "Видео", path: "Обучение/Продавцы/Видео" },
    ]);
  });

  it("builds real links for sections and nested folders", () => {
    expect(getKnowledgeLibraryHref()).toBe("/KnowledgeLibrary");
    expect(getKnowledgeLibraryHref("abc")).toBe("/KnowledgeLibrary?section=abc");
    expect(getKnowledgeLibraryHref("abc", "Обучение/Продавцы")).toBe(
      `/KnowledgeLibrary?section=abc&path=${encodeURIComponent("Обучение/Продавцы")}`,
    );
  });

  it("returns the containing folder for search results", () => {
    expect(getParentKnowledgePath("Стандарты/2026/Инструкция.pdf")).toBe("Стандарты/2026");
    expect(getParentKnowledgePath("Инструкция.pdf")).toBe("");
  });

  it("splits the containing folder into segments", () => {
    expect(getKnowledgePathSegments("Стандарты/2026/Инструкция.pdf")).toEqual(["Стандарты", "2026"]);
    expect(getKnowledgePathSegments("Инструкция.pdf")).toEqual([]);
  });

  it("selects preview types, including office documents", () => {
    expect(getKnowledgePreviewType(".PDF")).toBe("pdf");
    expect(getKnowledgePreviewType(".jpg")).toBe("image");
    expect(getKnowledgePreviewType(".mp4")).toBe("video");
    expect(getKnowledgePreviewType(".xlsx")).toBe("office-online");
    expect(getKnowledgePreviewType(".xls")).toBe("office-online");
    expect(getKnowledgePreviewType(".docx")).toBe("office-online");
    expect(getKnowledgePreviewType(".doc")).toBe("office-online");
    expect(getKnowledgePreviewType(".csv")).toBe("office");
    expect(getKnowledgePreviewType(".zip")).toBe("download");
  });

  it("walks back through folders, then to the section list, then home", () => {
    expect(getKnowledgeBackPath(null, "")).toBe("/Main");
    expect(getKnowledgeBackPath("abc", "")).toBe("/KnowledgeLibrary");
    expect(getKnowledgeBackPath("abc", "Стандарты")).toBe("/KnowledgeLibrary?section=abc");
    expect(getKnowledgeBackPath("abc", "Стандарты/2026")).toBe(
      `/KnowledgeLibrary?section=abc&path=${encodeURIComponent("Стандарты")}`,
    );
  });

  it("formats large office and video files", () => {
    expect(formatKnowledgeFileSize(2048)).toBe("2 КБ");
    expect(formatKnowledgeFileSize(10 * 1024 * 1024)).toBe("10.0 МБ");
  });
});
