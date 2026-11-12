import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./useTheme";

type Listener = () => void;

/** jsdom에는 matchMedia가 없으므로 OS 다크 설정을 흉내 냅니다. */
function mockSystemDark(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_type: string, listener: Listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: Listener) => {
        listeners.delete(listener);
      },
    })),
  );
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function isDarkApplied() {
  return document.documentElement.classList.contains("dark");
}

describe("useTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  it("기본은 system이고 OS가 다크면 다크를 적용한다", () => {
    mockSystemDark(true);

    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe("system");
    expect(result.current.resolved).toBe("dark");
    expect(isDarkApplied()).toBe(true);
  });

  it("system일 때 OS 설정이 바뀌면 따라간다", () => {
    const system = mockSystemDark(false);
    const { result } = renderHook(() => useTheme());
    expect(isDarkApplied()).toBe(false);

    act(() => system.set(true));

    expect(result.current.resolved).toBe("dark");
    expect(isDarkApplied()).toBe(true);
  });

  it("cycle은 라이트 → 다크 → 시스템 순서로 바꾸고 화면에 적용한다", () => {
    mockSystemDark(true);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.cycle());
    expect(result.current.preference).toBe("light");
    expect(isDarkApplied()).toBe(false);

    act(() => result.current.cycle());
    expect(result.current.preference).toBe("dark");
    expect(isDarkApplied()).toBe(true);

    act(() => result.current.cycle());
    expect(result.current.preference).toBe("system");
    expect(isDarkApplied()).toBe(true);
  });

  it("matchMedia가 없으면 라이트로 동작한다", () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.resolved).toBe("light");
    expect(isDarkApplied()).toBe(false);
  });
});
