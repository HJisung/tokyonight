import { describe, expect, it } from "vitest";
import { applyTheme, nextThemePreference, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("system이면 OS 설정을 따른다", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("직접 고른 값은 OS 설정과 무관하다", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("nextThemePreference", () => {
  it("시스템 → 라이트 → 다크 → 시스템 순서로 돈다", () => {
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });
});

describe("applyTheme", () => {
  it("dark 클래스와 color-scheme을 함께 바꾼다", () => {
    const root = document.createElement("div");

    applyTheme("dark", root);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");

    applyTheme("light", root);
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });
});
