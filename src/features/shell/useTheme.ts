import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  applyTheme,
  getSystemDark,
  nextThemePreference,
  resolveTheme,
  subscribeSystemDark,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

export type ThemeState = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** 시스템 → 라이트 → 다크 순서로 바꿉니다. */
  cycle: () => void;
};

/**
 * 라이트·다크 테마. 기본은 시스템 설정을 따르고 OS 설정이 바뀌면 바로 따라갑니다.
 * 고른 값은 앱을 닫으면 사라집니다(설정의 저장 위치가 아직 정해지지 않음).
 */
export function useTheme(): ThemeState {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark);
  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const cycle = useCallback(() => {
    setPreference(nextThemePreference);
  }, []);

  return { preference, resolved, cycle };
}
