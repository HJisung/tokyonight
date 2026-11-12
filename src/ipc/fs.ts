import { invoke } from "@tauri-apps/api/core";

/**
 * 파일 작업 오류 종류. Rust `fs::error::FsErrorKind`와 같습니다.
 *
 * - `notFound`: 경로가 없음
 * - `alreadyExists`: 만들기·이름 변경의 대상이 이미 있음(덮어쓰지 않음)
 * - `permissionDenied`: OS가 거부했거나 읽기 전용
 * - `outOfScope`: 사용자가 대화상자로 고르지 않은 경로
 * - `notUtf8`: UTF-8이 아니어서 열지 않음
 * - `other`: 그 밖의 오류
 */
export type FsErrorKind =
  | "notFound"
  | "alreadyExists"
  | "permissionDenied"
  | "outOfScope"
  | "notUtf8"
  | "other";

/** Rust `fs::error::FsError`와 같은 모양입니다. 아래 함수들은 실패하면 이 값으로 reject합니다. */
export type FsError = {
  kind: FsErrorKind;
  message: string;
};

/** 나열 결과의 종류. `unsupported`는 열 수 없는 파일입니다. */
export type FsEntryKind = "folder" | "markdown" | "text" | "unsupported";

/** Rust `fs::ops::Entry`와 같은 모양입니다. */
export type FsEntry = {
  name: string;
  path: string;
  kind: FsEntryKind;
};

const FS_ERROR_KINDS: readonly string[] = [
  "notFound",
  "alreadyExists",
  "permissionDenied",
  "outOfScope",
  "notUtf8",
  "other",
] satisfies FsErrorKind[];

export function isFsError(value: unknown): value is FsError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { kind, message } = value as { kind?: unknown; message?: unknown };
  return (
    typeof kind === "string" &&
    FS_ERROR_KINDS.includes(kind) &&
    typeof message === "string"
  );
}

/** 어떤 실패 값이든 `FsError`로 맞춥니다. 모르는 모양은 `other`가 됩니다. */
export function toFsError(error: unknown): FsError {
  if (isFsError(error)) {
    return { kind: error.kind, message: error.message };
  }
  if (error instanceof Error) {
    return { kind: "other", message: error.message };
  }
  return {
    kind: "other",
    message: typeof error === "string" ? error : String(error),
  };
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toFsError(error);
  }
}

/**
 * 폴더 선택 대화상자를 엽니다. 고른 폴더와 그 안의 모든 경로에 접근할 수 있게 됩니다.
 * 취소하면 `null`.
 */
export function pickFolder(): Promise<string | null> {
  return call<string | null>("fs_pick_folder");
}

/** 파일 열기 대화상자를 엽니다. 고른 파일 하나에 접근할 수 있게 됩니다. 취소하면 `null`. */
export function pickFile(): Promise<string | null> {
  return call<string | null>("fs_pick_file");
}

/**
 * 저장 대화상자를 엽니다. 고른 경로(아직 없는 파일 포함)에 쓸 수 있게 됩니다. 취소하면 `null`.
 * 이미 있는 파일을 고르면 덮어쓸지는 OS 대화상자가 묻습니다.
 */
export function pickSaveFile(defaultName?: string): Promise<string | null> {
  return call<string | null>("fs_pick_save_file", {
    defaultName: defaultName ?? null,
  });
}

/** 폴더 바로 아래 항목을 나열합니다. 숨김 항목은 빠지고, 폴더 먼저 이름순입니다. */
export function listDir(path: string): Promise<FsEntry[]> {
  return call<FsEntry[]>("fs_list_dir", { path });
}

/**
 * 파일을 UTF-8 텍스트로 읽습니다. 줄바꿈(CRLF/LF)과 BOM(U+FEFF)이 그대로 들어 있으므로,
 * 받은 문자열을 그대로 `writeTextFile`에 넘기면 바이트가 같게 저장됩니다.
 */
export function readTextFile(path: string): Promise<string> {
  return call<string>("fs_read_text", { path });
}

/** 내용을 그대로 씁니다(원자적 교체). 줄바꿈이나 BOM을 바꾸지 않습니다. */
export function writeTextFile(path: string, contents: string): Promise<void> {
  return call<void>("fs_write_text", { path, contents });
}

/** 빈 파일을 만들고 경로를 돌려줍니다. 이미 있으면 `alreadyExists`. */
export function createFile(path: string): Promise<string> {
  return call<string>("fs_create_file", { path });
}

/** 폴더를 만들고 경로를 돌려줍니다. 이미 있으면 `alreadyExists`. */
export function createFolder(path: string): Promise<string> {
  return call<string>("fs_create_folder", { path });
}

/** 이름을 바꾸거나 옮기고 새 경로를 돌려줍니다. 대상이 이미 있으면 `alreadyExists`. */
export function renameEntry(from: string, to: string): Promise<string> {
  return call<string>("fs_rename", { from, to });
}

/** 파일이나 폴더를 OS 휴지통으로 보냅니다. 영구 삭제하지 않습니다. */
export function deleteEntry(path: string): Promise<void> {
  return call<void>("fs_delete", { path });
}
