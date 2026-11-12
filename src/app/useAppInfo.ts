import { useEffect, useState } from "react";
import { getAppInfo, type AppInfo } from "@/ipc";

export type AppInfoState =
  | { status: "loading" }
  | { status: "ready"; info: AppInfo }
  | { status: "error"; message: string };

/** 앱 이름과 버전을 한 번 불러옵니다. */
export function useAppInfo(): AppInfoState {
  const [state, setState] = useState<AppInfoState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    getAppInfo().then(
      (info) => {
        if (!cancelled) setState({ status: "ready", info });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", message: String(error) });
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
