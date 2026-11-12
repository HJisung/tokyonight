import { useCallback, useState } from "react";
import { clampSidebarWidth, SIDEBAR_WIDTH } from "./sidebarWidth";

export type SidebarState = {
  collapsed: boolean;
  width: number;
  toggle: () => void;
  /** 허용 범위로 맞춰서 너비를 바꿉니다. */
  resize: (width: number) => void;
  resetWidth: () => void;
};

/**
 * 사이드바의 접힘 상태와 너비.
 * 앱을 다시 열었을 때의 복원은 하지 않습니다(작업 화면 설정의 저장 위치가 아직 정해지지 않음).
 */
export function useSidebar(): SidebarState {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState<number>(SIDEBAR_WIDTH.default);

  const toggle = useCallback(() => {
    setCollapsed((current) => !current);
  }, []);

  const resize = useCallback((next: number) => {
    setWidth(clampSidebarWidth(next));
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_WIDTH.default);
  }, []);

  return { collapsed, width, toggle, resize, resetWidth };
}
