import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFile,
  createFolder,
  deleteEntry,
  isFsError,
  listDir,
  pickFile,
  pickFolder,
  pickSaveFile,
  readTextFile,
  renameEntry,
  toFsError,
  writeTextFile,
} from "./fs";
import type { FsEntry, FsErrorKind } from "./fs";

// Rust 쪽 없이 래퍼만 검사하도록 invoke를 모의로 대체합니다.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("ipc/fs", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  describe("명령 호출", () => {
    it("대화상자 명령을 부르고 고른 경로를 돌려준다", async () => {
      invokeMock.mockResolvedValue("/notes");

      await expect(pickFolder()).resolves.toBe("/notes");
      await expect(pickFile()).resolves.toBe("/notes");
      await expect(pickSaveFile("새 메모.md")).resolves.toBe("/notes");
      await pickSaveFile();

      expect(invokeMock.mock.calls).toEqual([
        ["fs_pick_folder", undefined],
        ["fs_pick_file", undefined],
        ["fs_pick_save_file", { defaultName: "새 메모.md" }],
        ["fs_pick_save_file", { defaultName: null }],
      ]);
    });

    it("대화상자를 취소하면 null을 돌려준다", async () => {
      invokeMock.mockResolvedValue(null);

      await expect(pickFolder()).resolves.toBeNull();
    });

    it("listDir은 항목 목록을 그대로 돌려준다", async () => {
      const entries: FsEntry[] = [
        { name: "sub", path: "/notes/sub", kind: "folder" },
        { name: "a.md", path: "/notes/a.md", kind: "markdown" },
        { name: "LICENSE", path: "/notes/LICENSE", kind: "text" },
        { name: "image.png", path: "/notes/image.png", kind: "unsupported" },
      ];
      invokeMock.mockResolvedValue(entries);

      await expect(listDir("/notes")).resolves.toEqual(entries);
      expect(invokeMock).toHaveBeenCalledWith("fs_list_dir", {
        path: "/notes",
      });
    });

    it("읽은 내용과 쓰는 내용의 BOM·CRLF를 건드리지 않는다", async () => {
      const contents = `${String.fromCharCode(0xfeff)}# 제목\r\n본문\r\n`;
      invokeMock.mockResolvedValueOnce(contents);
      invokeMock.mockResolvedValueOnce(null);

      const read = await readTextFile("/notes/a.md");
      await writeTextFile("/notes/a.md", read);

      expect(read).toBe(contents);
      expect(invokeMock.mock.calls).toEqual([
        ["fs_read_text", { path: "/notes/a.md" }],
        ["fs_write_text", { path: "/notes/a.md", contents }],
      ]);
    });

    it("만들기·이름 변경·삭제 명령에 인자를 넘긴다", async () => {
      invokeMock.mockResolvedValue("/notes/result");

      await expect(createFile("/notes/new.md")).resolves.toBe("/notes/result");
      await expect(createFolder("/notes/sub")).resolves.toBe("/notes/result");
      await expect(renameEntry("/notes/a.md", "/notes/b.md")).resolves.toBe(
        "/notes/result",
      );
      await deleteEntry("/notes/b.md");

      expect(invokeMock.mock.calls).toEqual([
        ["fs_create_file", { path: "/notes/new.md" }],
        ["fs_create_folder", { path: "/notes/sub" }],
        ["fs_rename", { from: "/notes/a.md", to: "/notes/b.md" }],
        ["fs_delete", { path: "/notes/b.md" }],
      ]);
    });
  });

  describe("오류", () => {
    const kinds: FsErrorKind[] = [
      "notFound",
      "alreadyExists",
      "permissionDenied",
      "outOfScope",
      "notUtf8",
      "other",
    ];

    it.each(kinds)("Rust가 돌려준 %s 오류를 그대로 전한다", async (kind) => {
      invokeMock.mockRejectedValue({ kind, message: "이유" });

      await expect(readTextFile("/notes/a.md")).rejects.toEqual({
        kind,
        message: "이유",
      });
    });

    it("모르는 모양의 실패는 other로 바꾼다", async () => {
      invokeMock.mockRejectedValueOnce("command fs_read_text not found");
      await expect(readTextFile("/a")).rejects.toEqual({
        kind: "other",
        message: "command fs_read_text not found",
      });

      invokeMock.mockRejectedValueOnce(new Error("boom"));
      await expect(writeTextFile("/a", "")).rejects.toEqual({
        kind: "other",
        message: "boom",
      });

      invokeMock.mockRejectedValueOnce({ kind: "somethingNew", message: "?" });
      await expect(listDir("/a")).rejects.toMatchObject({ kind: "other" });
    });

    it("isFsError는 종류와 메시지가 맞는 값만 인정한다", () => {
      expect(isFsError({ kind: "outOfScope", message: "밖" })).toBe(true);
      expect(isFsError({ kind: "outOfScope" })).toBe(false);
      expect(isFsError({ kind: "nope", message: "x" })).toBe(false);
      expect(isFsError("outOfScope")).toBe(false);
      expect(isFsError(null)).toBe(false);
    });

    it("toFsError는 FsError의 필드만 남긴다", () => {
      expect(toFsError({ kind: "notUtf8", message: "x", extra: 1 })).toEqual({
        kind: "notUtf8",
        message: "x",
      });
      expect(toFsError(undefined)).toEqual({
        kind: "other",
        message: "undefined",
      });
    });
  });
});
