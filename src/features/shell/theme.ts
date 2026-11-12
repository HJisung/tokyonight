/** 사용자가 고른 테마. `system`은 OS 설정을 따릅니다. */
export type ThemePreference = "system" | "light" | "dark";

/** 화면에 실제로 적용되는 테마 */
export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return systemDark ? "dark" : "light";
  }
  return preference;
}

/** 전환 버튼을 누를 때의 순서: 시스템 → 라이트 → 다크 → 시스템 */
export function nextThemePreference(
  preference: ThemePreference,
): ThemePreference {
  switch (preference) {
    case "system":
      return "light";
    case "light":
      return "dark";
    case "dark":
      return "system";
  }
}

/** `theme.css`의 `.dark` 토큰과 브라우저 기본 UI(스크롤바 등)의 색 구성을 맞춥니다. */
export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function darkQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY)
    : null;
}

export function getSystemDark(): boolean {
  return darkQuery()?.matches ?? false;
}

/** OS의 라이트·다크 설정이 바뀔 때 알립니다. 돌려준 함수로 구독을 끊습니다. */
export function subscribeSystemDark(onChange: () => void): () => void {
  const query = darkQuery();
  if (!query) {
    return () => {};
  }
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** 첫 화면이 그려지기 전에 시스템 테마를 적용합니다(밝은 화면이 잠깐 보이는 것을 막음). */
export function applyInitialTheme(): void {
  applyTheme(resolveTheme("system", getSystemDark()));
}
