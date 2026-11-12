import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SIDEBAR_WIDTH } from "./sidebarWidth";
import { useSidebar } from "./useSidebar";

describe("useSidebar", () => {
  it("펼쳐진 상태와 기본 너비로 시작한다", () => {
    const { result } = renderHook(() => useSidebar());

    expect(result.current.collapsed).toBe(false);
    expect(result.current.width).toBe(SIDEBAR_WIDTH.default);
  });

  it("toggle은 접힘 상태를 뒤집고 너비는 그대로 둔다", () => {
    const { result } = renderHook(() => useSidebar());

    act(() => result.current.resize(320));
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(result.current.width).toBe(320);

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
  });

  it("resize는 허용 범위를 벗어나지 않는다", () => {
    const { result } = renderHook(() => useSidebar());

    act(() => result.current.resize(1));
    expect(result.current.width).toBe(SIDEBAR_WIDTH.min);

    act(() => result.current.resize(9999));
    expect(result.current.width).toBe(SIDEBAR_WIDTH.max);
  });

  it("resetWidth는 기본 너비로 되돌린다", () => {
    const { result } = renderHook(() => useSidebar());

    act(() => result.current.resize(400));
    act(() => result.current.resetWidth());
    expect(result.current.width).toBe(SIDEBAR_WIDTH.default);
  });
});
