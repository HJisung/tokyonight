import { describe, expect, it } from "vitest";
import {
  documentPath,
  documentSource,
  fileDocumentId,
  kindFromPath,
  scratchDocumentId,
} from "./documentId";
import type { DocumentId } from "./documentId";

describe("documentId", () => {
  it("파일 경로와 임시 ID를 구분한다", () => {
    const file = fileDocumentId("/notes/a.md");
    const scratch = scratchDocumentId("/notes/a.md");

    expect(file).not.toBe(scratch);
    expect(documentSource(file)).toEqual({ type: "file", path: "/notes/a.md" });
    expect(documentSource(scratch)).toEqual({
      type: "scratch",
      scratchId: "/notes/a.md",
    });
  });

  it("경로를 바꾸지 않고 그대로 돌려준다", () => {
    const path = "C:\\메모\\file: 초안.txt";
    expect(documentPath(fileDocumentId(path))).toBe(path);
    expect(documentPath(scratchDocumentId("1"))).toBeNull();
  });

  it("모르는 모양의 ID는 거부한다", () => {
    expect(() => documentSource("a.md" as DocumentId)).toThrow();
  });
});

describe("kindFromPath", () => {
  it(".md만 Markdown이다(대소문자 무시)", () => {
    expect(kindFromPath("/notes/a.md")).toBe("markdown");
    expect(kindFromPath("C:\\notes\\A.MD")).toBe("markdown");
  });

  it("그 밖의 확장자와 확장자 없는 파일은 일반 텍스트다", () => {
    expect(kindFromPath("/notes/a.txt")).toBe("text");
    expect(kindFromPath("/notes/README")).toBe("text");
    expect(kindFromPath("/notes.md/README")).toBe("text");
    expect(kindFromPath("/notes/.md")).toBe("text");
  });
});
