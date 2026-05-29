import { describe, expect, it } from "vitest";
import pageTitleReducer, { titleSet } from "../../Store/stateForPageTitleSlice";
import backButtonReducer, {
  pathSet,
  visibleSet,
} from "../../Store/stateForBackButtonSlice";

describe("pageTitleSlice", () => {
  it("updates title", () => {
    const state = pageTitleReducer(
      undefined,
      titleSet({ title: "РЈРІРµРґРѕРјР»РµРЅРёСЏ" })
    );
    expect(state.title).toBe("РЈРІРµРґРѕРјР»РµРЅРёСЏ");
  });
});

describe("backButtonSlice", () => {
  it("updates path", () => {
    const state = backButtonReducer(undefined, pathSet({ path: "/Main" }));
    expect(state.path).toBe("/Main");
  });

  it("updates visibility", () => {
    const state = backButtonReducer(undefined, visibleSet({ visible: true }));
    expect(state.visible).toBe(true);
  });
});
