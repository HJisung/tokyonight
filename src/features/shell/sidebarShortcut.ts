/** 단축키 판정에 필요한 키보드 이벤트의 일부 */
export type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

/**
 * 사이드바 접기·펴기: macOS `⌘\`, Windows `Ctrl+\`.
 * 한글 자판에서는 같은 키가 `₩`로 입력되므로 글자가 아니라 키 위치(`code`)로 판정합니다.
 */
export function isToggleSidebarShortcut(
  event: ShortcutKeyEvent,
  isMac: boolean,
): boolean {
  if (event.code !== "Backslash" || event.altKey || event.shiftKey) {
    return false;
  }
  return isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}
