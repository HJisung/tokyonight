/** 사이드바 너비 범위(px). 사용자가 끌어서 바꾸는 값이라 디자인 토큰이 아니라 여기서 관리합니다. */
export const SIDEBAR_WIDTH = {
  min: 200,
  default: 264,
  max: 480,
  /** 키보드로 조절할 때 한 번에 움직이는 양 */
  step: 16,
} as const;

/** 너비를 허용 범위 안의 정수로 맞춥니다. 숫자가 아니면 기본값을 돌려줍니다. */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return SIDEBAR_WIDTH.default;
  }
  return Math.min(
    SIDEBAR_WIDTH.max,
    Math.max(SIDEBAR_WIDTH.min, Math.round(width)),
  );
}
