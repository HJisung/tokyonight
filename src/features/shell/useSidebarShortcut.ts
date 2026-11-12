import { useEffect } from "react";
import { isMacPlatform, isToggleSidebarShortcut } from "./sidebarShortcut";

/** 창 어디에서든 사이드바 단축키를 누르면 `onToggle`을 부릅니다. */
export function useSidebarShortcut(onToggle: () => void): void {
  useEffect(() => {
    const isMac = isMacPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (isToggleSidebarShortcut(event, isMac)) {
        event.preventDefault();
        onToggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onToggle]);
}
