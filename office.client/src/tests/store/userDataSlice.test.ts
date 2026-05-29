import { describe, expect, it } from "vitest";
import userDataReducer, {
  clearUserData,
  setUserData,
} from "../../Store/userDataSlice";

describe("userDataSlice", () => {
  it("has an empty initial state", () => {
    const state = userDataReducer(undefined, { type: "unknown" });

    expect(state).toEqual({
      newNotifications: [],
      activeNotifications: [],
      roles: [],
      loaded: false,
    });
  });

  it("stores notifications and roles on setUserData", () => {
    const state = userDataReducer(
      undefined,
      setUserData({
        newNotifications: [
          {
            id: 1,
            dateTime: "2026-05-28T10:00:00",
            typeId: 1,
            officeNotificationType: { id: 1, name: "Type 1" },
            officeUserId: 3,
            relatedEntity: 1,
            status: 0,
          },
        ],
        activeNotifications: [],
        roles: ["Calculator"],
      })
    );

    expect(state.loaded).toBe(true);
    expect(state.roles).toEqual(["Calculator"]);
    expect(state.newNotifications).toHaveLength(1);
  });

  it("clears user data", () => {
    const state = userDataReducer(
      {
        newNotifications: [
          {
            id: 1,
            dateTime: "2026-05-28T10:00:00",
            typeId: 1,
            officeNotificationType: { id: 1, name: "Type 1" },
            officeUserId: 3,
            relatedEntity: 1,
            status: 0,
          },
        ],
        activeNotifications: [],
        roles: ["Calculator"],
        loaded: true,
      },
      clearUserData()
    );

    expect(state).toEqual({
      newNotifications: [],
      activeNotifications: [],
      roles: [],
      loaded: false,
    });
  });
});
