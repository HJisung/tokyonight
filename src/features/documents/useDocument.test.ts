import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { documents } from "./documentStore";
import { useDocument } from "./useDocument";

vi.mock("@/ipc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ipc")>()),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

describe("useDocument", () => {
  it("열려 있는 문서의 내용과 수정됨 상태를 따라간다", () => {
    const scratch = documents.createScratch();
    const { result } = renderHook(() => useDocument(scratch.id));

    expect(result.current).toMatchObject({ content: "", dirty: false });

    act(() => {
      documents.setContent(scratch.id, "메모");
    });
    expect(result.current).toMatchObject({ content: "메모", dirty: true });

    act(() => {
      documents.close(scratch.id, { discard: true });
    });
    expect(result.current).toBeUndefined();
  });

  it("ID가 없으면 undefined", () => {
    const { result } = renderHook(() => useDocument(null));
    expect(result.current).toBeUndefined();
  });
});
