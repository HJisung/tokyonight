import { describe, expect, it } from "vitest";
import {
  isToggleSidebarShortcut,
  type ShortcutKeyEvent,
} from "./sidebarShortcut";

function key(overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return {
    code: "Backslash",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("isToggleSidebarShortcut", () => {
  it("macOS에서는 ⌘\\ 만 받는다", () => {
    expect(isToggleSidebarShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isToggleSidebarShortcut(key({ ctrlKey: true }), true)).toBe(false);
  });

  it("Windows에서는 Ctrl+\\ 만 받는다", () => {
    expect(isToggleSidebarShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isToggleSidebarShortcut(key({ metaKey: true }), false)).toBe(false);
  });

  it("다른 키나 Shift·Alt 조합은 받지 않는다", () => {
    expect(
      isToggleSidebarShortcut(key({ code: "KeyB", metaKey: true }), true),
    ).toBe(false);
    expect(
      isToggleSidebarShortcut(key({ metaKey: true, shiftKey: true }), true),
    ).toBe(false);
    expect(
      isToggleSidebarShortcut(key({ ctrlKey: true, altKey: true }), false),
    ).toBe(false);
    expect(isToggleSidebarShortcut(key({}), true)).toBe(false);
  });
});
