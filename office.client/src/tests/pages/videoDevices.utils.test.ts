import { describe, expect, it } from "vitest";
import { canManageWithoutAdb, canScreenshot, connectionStatus, deviceHealth, describePresence, diagnosticFacts, formatSince, isUrgent, needsPortCheck, shortProblem, updateOutcome, hasNoSignal, resolveSelectedVideoName, matchesScope, matchesStatus, readStoredFilters, FILTER_STORAGE_KEY } from "../../Pages/VideoDevices/videoDevices.utils";
import type { Device, DevicePresence } from "../../Pages/VideoDevices/videoDevices.types";

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

describe("статус приставки по сигналам", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const base: DevicePresence = {
    status: "playing",
    lastSeenUtc: "2026-11-16T11:59:30Z",
    problems: [],
    muted: false,
    itemsReady: 1,
    itemsTotal: 1,
    currentFile: "TV1_90_06112026.mp4",
  };

  it("формирует понятные интервалы", () => {
    expect(formatSince("2026-11-16T11:59:30Z", now)).toBe("только что");
    expect(formatSince("2026-11-16T11:52:00Z", now)).toBe("8 мин");
    expect(formatSince("2026-11-16T09:55:00Z", now)).toBe("2 ч 5 мин");
    expect(formatSince("2026-11-13T12:00:00Z", now)).toBe("3 дн");
  });

  it("показывает, что контент идёт", () => {
    const view = describePresence(base, now);
    expect(view.tone).toBe("success");
    expect(view.label).toBe("Показывает");
    expect(view.details).toContain("TV1_90_06112026.mp4");
  });

  it("выносит первую проблему в подпись", () => {
    const view = describePresence({ ...base, status: "problem", problems: ["Экран не показывает контент"] }, now);
    expect(view.tone).toBe("warning");
    expect(view.label).toBe("Пустой экран");
    expect(view.details).toContain("Экран не показывает контент");
  });

  it("нет связи без проблем — серый спокойный статус, не неисправность", () => {
    const view = describePresence({ ...base, status: "offline", lastSeenUtc: "2026-11-16T11:40:00Z" }, now);
    expect(view.tone).toBe("neutral");
    expect(view.label).toBe("Нет связи 20 мин");
    expect(view.details).toContain("пропал интернет на точке");
  });

  it("нет связи и требует внимания — красный, с последней известной проблемой", () => {
    const view = describePresence(
      { ...base, status: "offline", attention: true, problems: ["Экран не показывает контент"], lastSeenUtc: "2026-11-16T11:40:00Z" },
      now,
    );
    expect(view.tone).toBe("danger");
    expect(view.details).toContain("Перед этим: Экран не показывает контент");
  });

  it("итог по приставке для счётчиков", () => {
    const device = { guid: "1", presence: null } as unknown as Device;
    expect(deviceHealth({ ...device, presence: { ...base, status: "playing" } })).toBe("working");
    expect(deviceHealth({ ...device, presence: { ...base, status: "offline" } })).toBe("noSignal");
    expect(deviceHealth({ ...device, presence: { ...base, status: "offline", attention: true } })).toBe("attention");
    expect(deviceHealth({ ...device, presence: { ...base, status: "problem", problems: ["x"] } })).toBe("attention");
    // Старое приложение — по проверке 8080
    expect(deviceHealth(device, { status: "online" })).toBe("working");
    expect(deviceHealth(device, { status: "offline" })).toBe("attention");
    expect(deviceHealth(device)).toBe("unknown");
  });

  it("фильтр «Нет связи» не цепляет приставки со старым приложением", () => {
    const device = { guid: "1", presence: null } as unknown as Device;
    expect(hasNoSignal(device)).toBe(false);
    expect(hasNoSignal({ ...device, presence: { ...base, status: "offline" } })).toBe(true);
  });
});

describe("связь без опроса по 8080", () => {
  const playing = { status: "playing", lastSeenUtc: "2026-11-16T12:00:00Z", problems: [], muted: false, itemsReady: 1, itemsTotal: 1 } as DevicePresence;
  const legacy = { guid: "1", presence: null } as unknown as Device;
  const modern = { ...legacy, presence: playing } as Device;

  it("приставки 2.0 не проверяются по 8080, старые — проверяются", () => {
    expect(needsPortCheck(modern)).toBe(false);
    expect(needsPortCheck(legacy)).toBe(true);
  });

  it("для 2.0 связь — по сигналу, давняя ручная проверка его не перебивает", () => {
    expect(connectionStatus(modern)).toBe("online");
    expect(connectionStatus(modern, { status: "offline" })).toBe("online");
    const offline = { ...legacy, presence: { ...playing, status: "offline" } } as Device;
    expect(connectionStatus(offline)).toBe("offline");
    // Сигнала нет, а ручная проверка видит ADB — приложение можно запустить
    expect(connectionStatus(offline, { status: "ping" })).toBe("ping");
    expect(connectionStatus(legacy, { status: "online" })).toBe("online");
    expect(connectionStatus(legacy)).toBeUndefined();
  });
});

describe("звук и зависания в диагностике", () => {
  const music = {
    status: "problem", lastSeenUtc: "2026-11-16T12:00:00Z", problems: ["Звук выключен на приставке (громкость 0%)"],
    muted: false, itemsReady: 1, itemsTotal: 1, mode: "music", volumePercent: 0, systemMuted: false, audioOutput: "line",
  } as DevicePresence;

  it("короткие подписи на плашке", () => {
    expect(shortProblem("Звук выключен на приставке (громкость 0%)")).toBe("Нет звука");
    expect(shortProblem("Звук идёт в HDMI, а телевизор не подключён")).toBe("Нет звука");
    expect(shortProblem("Изображение зависло: стоит 50 с")).toBe("Зависло");
  });

  it("плитки «Звук» и «Воспроизведение»", () => {
    const facts = diagnosticFacts(music, Date.parse("2026-11-16T12:01:00Z"));
    expect(facts.find((f) => f.label === "Звук")).toEqual(expect.objectContaining({ value: "выключен, колонки", tone: "danger" }));
    const frozen = diagnosticFacts({ ...music, mode: "video", stalledSeconds: 50 });
    expect(frozen.find((f) => f.label === "Воспроизведение")?.value).toBe("стоит 50 с");
    expect(frozen.find((f) => f.label === "Звук")).toBeUndefined();
  });
});

describe("подтверждение обновления командой", () => {
  const started = Date.parse("2026-11-17T12:00:00Z");
  const presence = (seen: string, uptime: number, extra: Partial<DevicePresence> = {}) =>
    ({ status: "playing", lastSeenUtc: seen, problems: [], muted: false, itemsReady: 1, itemsTotal: 1, uptimeSeconds: uptime, appVersion: "2.1", ...extra }) as DevicePresence;

  it("ждёт, пока не пришёл сигнал после команды", () => {
    expect(updateOutcome(started, presence("2026-11-17T11:59:00Z", 3600), started + 60_000)).toEqual({ state: "pending" });
    // Сигнал после команды, но от старого процесса (работает час) — ещё не обновилось
    expect(updateOutcome(started, presence("2026-11-17T12:01:00Z", 3600), started + 70_000)).toEqual({ state: "pending" });
  });

  it("успех — сигнал от приложения, запущенного после команды", () => {
    expect(updateOutcome(started, presence("2026-11-17T12:02:00Z", 40), started + 130_000)).toEqual({ state: "done", version: "2.1" });
  });

  it("ошибка установки и таймаут", () => {
    const failed = presence("2026-11-17T12:01:00Z", 3600, { lastError: "Обновление (2.1.apk) не удалось: APK подписан другим ключом" });
    expect(updateOutcome(started, failed, started + 70_000)).toEqual({ state: "failed", message: failed.lastError });
    expect(updateOutcome(started, presence("2026-11-17T11:59:00Z", 3600), started + 7 * 60_000)).toEqual({ state: "timeout" });
  });
});

describe("права приставки", () => {
  const base = { status: "playing", lastSeenUtc: "2026-11-17T12:00:00Z", problems: [], muted: false, itemsReady: 1, itemsTotal: 1 } as DevicePresence;

  it("без ADB — при root или правах владельца; старые сборки 2.0 без поля считаются с root", () => {
    expect(canManageWithoutAdb({ ...base, hasRoot: true })).toBe(true);
    expect(canManageWithoutAdb({ ...base, hasRoot: false, deviceOwner: true })).toBe(true);
    expect(canManageWithoutAdb({ ...base, hasRoot: false, deviceOwner: false })).toBe(false);
    expect(canManageWithoutAdb(base)).toBe(true);
    expect(canManageWithoutAdb(null)).toBe(false);
  });

  it("скриншот — только с root", () => {
    expect(canScreenshot({ ...base, hasRoot: false, deviceOwner: true })).toBe(false);
    expect(canScreenshot({ ...base, hasRoot: true })).toBe(true);
    expect(canScreenshot(null)).toBe(true);
  });

  it("плитка «Права»", () => {
    expect(diagnosticFacts({ ...base, hasRoot: false, deviceOwner: false }).find((f) => f.label === "Права"))
      .toEqual(expect.objectContaining({ value: "нет — только через ADB", tone: "warning" }));
    expect(diagnosticFacts({ ...base, hasRoot: true, deviceOwner: false }).find((f) => f.label === "Права")?.value).toBe("root");
  });
});

describe("оперативная память", () => {
  const base = { status: "playing", lastSeenUtc: "2026-11-17T12:00:00Z", problems: [], muted: false, itemsReady: 1, itemsTotal: 1 } as DevicePresence;

  it("свободно — и сколько всего", () => {
    expect(diagnosticFacts({ ...base, ramFreeMb: 525, ramTotalMb: 2048 }).find((f) => f.label === "Свободно ОЗУ")?.value)
      .toBe("525 МБ (из 2,0 ГБ)");
    // Прошивка выдаёт 1 ГБ за 2 ГБ — показываем физический объём
    expect(diagnosticFacts({ ...base, ramFreeMb: 573, ramTotalMb: 2048, ramPhysicalMb: 1024 }).find((f) => f.label === "Свободно ОЗУ")?.value)
      .toBe("573 МБ (из 1,0 ГБ)");
    // Старые сборки не присылают общий объём — только свободно
    expect(diagnosticFacts({ ...base, ramFreeMb: 525 }).find((f) => f.label === "Свободно ОЗУ")?.value).toBe("525 МБ");
  });
});

describe("уровни проблем", () => {
  const base = { status: "problem", lastSeenUtc: "2026-11-16T12:00:00Z", muted: false, itemsReady: 1, itemsTotal: 1 } as DevicePresence;

  it("красный — контент не доходит до зрителя, жёлтый — деградирует", () => {
    expect(describePresence({ ...base, problems: ["Экран не показывает контент"], severity: "critical" }).tone).toBe("danger");
    expect(describePresence({ ...base, problems: ["Мало места: 800 МБ"], severity: "warning" }).tone).toBe("warning");
  });

  it("короткие подписи новых проблем", () => {
    expect(shortProblem("Скачано 600 из 623 — уже 3 ч")).toBe("Скачано 600 из 623");
    expect(shortProblem("Перегрев: 92 °C — приставка может тормозить и зависать")).toBe("Перегрев");
    expect(shortProblem("Плеер зависал 3 раз(а) за час — проверьте файл или приставку")).toBe("Зависает");
    expect(shortProblem("Часы приставки отстают на 2 ч")).toBe("Сбиты часы");
  });

  it("срочные — только красные", () => {
    const device = { guid: "1" } as Device;
    expect(isUrgent({ ...device, presence: { ...base, problems: ["x"], severity: "critical" } })).toBe(true);
    expect(isUrgent({ ...device, presence: { ...base, problems: ["x"], severity: "warning" } })).toBe(false);
    expect(isUrgent({ ...device, presence: null })).toBe(false);
  });
});

describe("фильтры списка приставок", () => {
  const presence: DevicePresence = {
    status: "playing",
    lastSeenUtc: "2026-11-16T11:59:30Z",
    problems: [],
    muted: false,
    itemsReady: 1,
    itemsTotal: 1,
  };
  const make = (patch: Partial<Device>): Device =>
    ({ guid: "1", ip: "10.0.0.1:8080", locationName: "Точка", isTestLocation: false, videoList: "[]", version: "2.0", onlyMusic: 0, ...patch }) as Device;

  it("выбор точек: розница целиком, видео, музыка или тестовые", () => {
    const both = make({ onlyMusic: 0 });
    const musicOnly = make({ onlyMusic: 1 });
    const videoOnly = make({ onlyMusic: null });
    const test = make({ isTestLocation: true });
    expect([both, musicOnly, videoOnly, test].map((d) => matchesScope(d, "all"))).toEqual([true, true, true, false]);
    expect([both, musicOnly, videoOnly, test].map((d) => matchesScope(d, "video"))).toEqual([true, false, true, false]);
    expect([both, musicOnly, videoOnly, test].map((d) => matchesScope(d, "music"))).toEqual([true, true, false, false]);
    expect([both, musicOnly, videoOnly, test].map((d) => matchesScope(d, "test"))).toEqual([false, false, false, true]);
  });

  it("плитка состояния показывает ровно те приставки, что в её числе", () => {
    const working = make({ presence });
    const offline = make({ presence: { ...presence, status: "offline" } });
    const urgent = make({ presence: { ...presence, status: "problem", severity: "critical" } });
    const old = make({ version: "1.9" });
    expect(matchesStatus(working, "working", undefined, "2.0")).toBe(true);
    expect(matchesStatus(offline, "noSignal", undefined, "2.0")).toBe(true);
    expect(matchesStatus(offline, "attention", undefined, "2.0")).toBe(false);
    expect(matchesStatus(urgent, "attention", undefined, "2.0")).toBe(true);
    expect(matchesStatus(urgent, "urgent", undefined, "2.0")).toBe(true);
    expect(matchesStatus(working, "urgent", undefined, "2.0")).toBe(false);
    expect(matchesStatus(old, "outdated", undefined, "2.0")).toBe(true);
    expect(matchesStatus(working, "outdated", undefined, "2.0")).toBe(false);
    expect(matchesStatus(old, "all", undefined, "2.0")).toBe(true);
  });

  it("сохранённые фильтры старого формата переносятся", () => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ video: true, music: true, test: true, attention: true }));
    expect(readStoredFilters()).toEqual({ scope: "test", status: "all" });
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ video: false, music: true, test: false }));
    expect(readStoredFilters()).toEqual({ scope: "music", status: "all" });
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ scope: "video", status: "urgent" }));
    expect(readStoredFilters()).toEqual({ scope: "video", status: "urgent" });
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ scope: "мусор", status: 5 }));
    expect(readStoredFilters()).toEqual({ scope: "all", status: "all" });
    localStorage.removeItem(FILTER_STORAGE_KEY);
  });
});
