import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppInfo } from "@/ipc";
import { useAppInfo } from "./useAppInfo";

// Rust 쪽 없이 훅만 검사하도록 ipc를 모의로 대체합니다.
vi.mock("@/ipc", () => ({
  getAppInfo: vi.fn(),
}));

const getAppInfoMock = vi.mocked(getAppInfo);

describe("useAppInfo", () => {
  beforeEach(() => {
    getAppInfoMock.mockReset();
  });

  it("불러오는 동안 loading, 응답을 받으면 ready가 된다", async () => {
    getAppInfoMock.mockResolvedValue({ name: "tokyonight", version: "0.1.0" });

    const { result } = renderHook(() => useAppInfo());

    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() => {
      expect(result.current).toEqual({
        status: "ready",
        info: { name: "tokyonight", version: "0.1.0" },
      });
    });
    expect(getAppInfoMock).toHaveBeenCalledTimes(1);
  });

  it("호출이 실패하면 error와 메시지를 돌려준다", async () => {
    getAppInfoMock.mockRejectedValue("command get_app_info not found");

    const { result } = renderHook(() => useAppInfo());

    await waitFor(() => {
      expect(result.current).toEqual({
        status: "error",
        message: "command get_app_info not found",
      });
    });
  });

  it("언마운트한 뒤 도착한 응답은 무시한다", async () => {
    let resolve: (info: { name: string; version: string }) => void = () => {};
    getAppInfoMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result, unmount } = renderHook(() => useAppInfo());
    unmount();
    resolve({ name: "tokyonight", version: "0.1.0" });
    await Promise.resolve();

    expect(result.current).toEqual({ status: "loading" });
  });
});
