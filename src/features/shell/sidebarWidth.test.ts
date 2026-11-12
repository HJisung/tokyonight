import { describe, expect, it } from "vitest";
import { clampSidebarWidth, SIDEBAR_WIDTH } from "./sidebarWidth";

describe("clampSidebarWidth", () => {
  it("범위 안의 값은 반올림만 한다", () => {
    expect(clampSidebarWidth(300.4)).toBe(300);
  });

  it("최소보다 작으면 최소, 최대보다 크면 최대로 맞춘다", () => {
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_WIDTH.min);
    expect(clampSidebarWidth(10_000)).toBe(SIDEBAR_WIDTH.max);
  });

  it("숫자가 아니면 기본값을 돌려준다", () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH.default);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(
      SIDEBAR_WIDTH.default,
    );
  });
});
