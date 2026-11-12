import { invoke } from "@tauri-apps/api/core";

/** Rust `app_info::AppInfo`와 같은 모양입니다. */
export type AppInfo = {
  name: string;
  version: string;
};

/** 앱 이름과 버전을 Rust에서 받아 옵니다. */
export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info");
}
