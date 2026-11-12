import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type TopBarProps = {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  /** 사이드바 요소의 id (접기 버튼이 가리키는 대상) */
  sidebarId: string;
  /** 워크스페이스 탭이 들어갈 자리 */
  tabs: ReactNode;
  /** 오른쪽 끝에 두는 창 단위 동작(테마 전환 등) */
  actions: ReactNode;
};

/** 창 위쪽 줄: 사이드바 접기 버튼, 워크스페이스 탭 자리, 창 단위 동작. */
export function TopBar({
  sidebarCollapsed,
  onToggleSidebar,
  sidebarId,
  tabs,
  actions,
}: TopBarProps) {
  const ToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = sidebarCollapsed ? "사이드바 펴기" : "사이드바 접기";

  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b bg-sidebar px-1.5 text-sidebar-foreground select-none">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={toggleLabel}
        title={toggleLabel}
        aria-expanded={!sidebarCollapsed}
        aria-controls={sidebarId}
        onClick={onToggleSidebar}
      >
        <ToggleIcon aria-hidden="true" />
      </Button>
      <nav
        aria-label="워크스페이스"
        className="flex h-full min-w-0 flex-1 items-center"
      >
        {tabs}
      </nav>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </header>
  );
}
