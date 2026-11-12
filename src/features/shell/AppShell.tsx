import type { ReactNode } from "react";
import { RegionPlaceholder } from "./RegionPlaceholder";
import { Sidebar } from "./Sidebar";
import { SidebarResizer } from "./SidebarResizer";
import { ThemeToggle } from "./ThemeToggle";
import { TopBar } from "./TopBar";
import { useSidebar } from "./useSidebar";
import { useSidebarShortcut } from "./useSidebarShortcut";
import { useTheme } from "./useTheme";

type AppShellProps = {
  /** 왼쪽 사이드바 내용(파일 목록). 없으면 빈 자리를 보여 줍니다. */
  sidebar?: ReactNode;
  /** 위쪽 줄의 워크스페이스 탭. 없으면 빈 자리를 보여 줍니다. */
  tabs?: ReactNode;
  /** 본문 영역(문서, 분할 영역, 시작 화면). 없으면 빈 자리를 보여 줍니다. */
  children?: ReactNode;
};

const SIDEBAR_ID = "app-sidebar";

/** 앱 창의 뼈대: 위쪽 워크스페이스 탭 줄, 왼쪽 사이드바, 본문 영역. */
export function AppShell({ sidebar, tabs, children }: AppShellProps) {
  const sidebarState = useSidebar();
  const theme = useTheme();
  useSidebarShortcut(sidebarState.toggle);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        sidebarCollapsed={sidebarState.collapsed}
        onToggleSidebar={sidebarState.toggle}
        sidebarId={SIDEBAR_ID}
        tabs={
          tabs ?? (
            <RegionPlaceholder label="워크스페이스 탭 자리" className="px-2" />
          )
        }
        actions={
          <ThemeToggle preference={theme.preference} onCycle={theme.cycle} />
        }
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          id={SIDEBAR_ID}
          collapsed={sidebarState.collapsed}
          width={sidebarState.width}
        >
          {sidebar ?? (
            <RegionPlaceholder label="파일 목록 자리" className="p-3" />
          )}
        </Sidebar>
        {!sidebarState.collapsed && (
          <SidebarResizer
            width={sidebarState.width}
            onResize={sidebarState.resize}
            onReset={sidebarState.resetWidth}
            controls={SIDEBAR_ID}
          />
        )}
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          {children ?? (
            <div className="flex h-full items-center justify-center p-6">
              <RegionPlaceholder label="문서 영역 자리" />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
