import type { ReactNode } from "react";

type SidebarProps = {
  id: string;
  collapsed: boolean;
  /** 펼쳤을 때의 너비(px). 사용자가 조절하는 값입니다. */
  width: number;
  children: ReactNode;
};

/**
 * 왼쪽 사이드바. 접어도 내용을 내리지 않고 숨기기만 해서,
 * 다시 폈을 때 안쪽 상태(스크롤 위치 등)가 그대로 남습니다.
 */
export function Sidebar({ id, collapsed, width, children }: SidebarProps) {
  return (
    <aside
      id={id}
      aria-label="파일"
      hidden={collapsed}
      style={{ width }}
      className="min-h-0 shrink-0 overflow-auto bg-sidebar text-sidebar-foreground"
    >
      {children}
    </aside>
  );
}
