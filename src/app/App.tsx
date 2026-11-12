import { AppShell } from "@/features/shell";
import { useAppInfo } from "./useAppInfo";

export function App() {
  const appInfo = useAppInfo();

  return (
    <AppShell>
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
        {appInfo.status === "loading" && (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        )}
        {appInfo.status === "ready" && (
          <>
            <h1 className="text-2xl font-medium">{appInfo.info.name}</h1>
            <p className="text-sm text-muted-foreground">
              v{appInfo.info.version}
            </p>
          </>
        )}
        {appInfo.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            앱 정보를 불러오지 못했습니다: {appInfo.message}
          </p>
        )}
      </div>
    </AppShell>
  );
}
