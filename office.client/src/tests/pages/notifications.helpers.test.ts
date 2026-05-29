import { beforeEach, describe, expect, it } from "vitest";
import type { OfficeNotification } from "../../Interfaces/UserData";
import {
  formatNotificationDate,
  getNotificationEntityPreview,
  isAccessRequestData,
  markNotificationsAsViewed,
  normalizeNotification,
  removeNotificationById,
  resolveNotificationUserId,
  sortNotificationsByDateDesc,
  toUserDataPayload,
} from "../../Pages/Notifications/notifications.helpers";

const baseNotification: OfficeNotification = {
  id: 1,
  dateTime: "2026-05-28T10:00:00",
  typeId: 1,
  officeNotificationType: { id: 1, name: "Type 1" },
  officeUserId: 3,
  relatedEntity: 99,
  status: 0,
};

describe("notifications helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("formats valid dates and keeps invalid values untouched", () => {
    expect(formatNotificationDate("bad-date")).toBe("bad-date");
    expect(formatNotificationDate(baseNotification.dateTime)).toContain("2026");
  });

  it("normalizes API notification with fallback type", () => {
    const result = normalizeNotification({
      ...baseNotification,
      officeNotificationType: undefined,
    });

    expect(result.officeNotificationType).toEqual({ id: 1, name: "Тип 1" });
  });

  it("resolves user id from store first and then from localStorage", () => {
    localStorage.setItem("id", "42");

    expect(resolveNotificationUserId(7)).toBe(7);
    expect(resolveNotificationUserId(null)).toBe(42);
  });

  it("detects access request payloads", () => {
    expect(
      isAccessRequestData({
        officeUserId: 5,
        dateTime: "2026-05-28T10:00:00",
        id: 1,
        status: 0,
        comment: null,
      })
    ).toBe(true);
    expect(isAccessRequestData("text")).toBe(false);
  });

  it("builds entity preview from access request user full name", () => {
    const preview = getNotificationEntityPreview({
      ...baseNotification,
      relatedEntityData: {
        id: 2,
        officeUserId: 8,
        dateTime: "2026-05-28T11:00:00",
        status: 0,
        comment: "comment",
        officeUser: {
          id: 8,
          login: "user",
          name: "Иван",
          surname: "Иванов",
          patronymic: "Иванович",
          position: "Dev",
        },
      },
    });

    expect(preview).toBe("Иванов Иван Иванович");
  });

  it("sorts notifications by date descending", () => {
    const sorted = sortNotificationsByDateDesc([
      { ...baseNotification, id: 1, dateTime: "2026-05-28T09:00:00" },
      { ...baseNotification, id: 2, dateTime: "2026-05-28T12:00:00" },
    ]);

    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
  });

  it("marks notifications as viewed and removes acknowledged ones", () => {
    const source = [
      { ...baseNotification, id: 1, status: 0 },
      { ...baseNotification, id: 2, status: 1 },
    ];

    const viewed = markNotificationsAsViewed(source, [1]);
    const remaining = removeNotificationById(viewed, 2);

    expect(viewed[0].status).toBe(1);
    expect(remaining.map((item) => item.id)).toEqual([1]);
  });

  it("builds user data payload from current notifications", () => {
    const payload = toUserDataPayload(
      [
        { ...baseNotification, id: 1, status: 0 },
        { ...baseNotification, id: 2, status: 1 },
        { ...baseNotification, id: 3, status: 2 },
      ],
      ["Calculator"]
    );

    expect(payload.newNotifications).toHaveLength(1);
    expect(payload.activeNotifications).toHaveLength(1);
    expect(payload.roles).toEqual(["Calculator"]);
  });
});
