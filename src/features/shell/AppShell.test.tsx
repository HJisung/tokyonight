import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { SIDEBAR_WIDTH } from "./sidebarWidth";

// 숨겨진 요소는 접근성 이름이 계산되지 않으므로 이름 없이 역할로만 찾습니다.
function getSidebar() {
  return screen.getByRole("complementary", { hidden: true });
}

describe("AppShell", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  it("탭 줄, 사이드바, 본문 세 영역을 그린다", () => {
    render(<AppShell />);

    expect(screen.getByRole("banner")).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "워크스페이스" }),
    ).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "파일" })).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("넘겨받은 내용을 각 영역에 넣는다", () => {
    render(
      <AppShell sidebar={<p>파일들</p>} tabs={<p>탭들</p>}>
        <p>문서</p>
      </AppShell>,
    );

    expect(getSidebar().textContent).toBe("파일들");
    expect(
      screen.getByRole("navigation", { name: "워크스페이스" }).textContent,
    ).toBe("탭들");
    expect(screen.getByRole("main").textContent).toBe("문서");
  });

  it("접기 버튼을 누르면 사이드바와 경계선이 숨고, 다시 누르면 돌아온다", () => {
    render(<AppShell sidebar={<p>파일들</p>} />);

    fireEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
    expect(getSidebar().hidden).toBe(true);
    expect(screen.queryByRole("separator")).toBeNull();
    // 접어도 내용은 내려가지 않는다.
    expect(getSidebar().textContent).toBe("파일들");

    fireEvent.click(screen.getByRole("button", { name: "사이드바 펴기" }));
    expect(getSidebar().hidden).toBe(false);
    expect(screen.getByRole("separator")).toBeTruthy();
  });

  it("단축키(Ctrl+\\)로 사이드바를 접는다", () => {
    render(<AppShell />);

    fireEvent.keyDown(window, { code: "Backslash", ctrlKey: true });

    expect(getSidebar().hidden).toBe(true);
  });

  it("경계선에서 방향키로 너비를 바꾸고 범위를 넘지 않는다", () => {
    render(<AppShell />);
    const separator = screen.getByRole("separator");

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(getSidebar().style.width).toBe(
      `${SIDEBAR_WIDTH.default + SIDEBAR_WIDTH.step}px`,
    );

    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(getSidebar().style.width).toBe(`${SIDEBAR_WIDTH.min}px`);
  });

  it("경계선을 끌면 움직인 만큼 너비가 바뀐다", () => {
    render(<AppShell />);
    const separator = screen.getByRole("separator");

    fireEvent.pointerDown(separator, { button: 0, clientX: 264 });
    fireEvent.pointerMove(separator, { clientX: 304 });
    fireEvent.pointerUp(separator);
    // 놓은 뒤의 움직임은 무시한다.
    fireEvent.pointerMove(separator, { clientX: 400 });

    expect(getSidebar().style.width).toBe(`${SIDEBAR_WIDTH.default + 40}px`);
  });

  it("테마 버튼을 누르면 라이트 → 다크로 바뀐다", () => {
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: /^테마: 시스템 설정/ }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /^테마: 라이트/ }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: /^테마: 다크/ })).toBeTruthy();
  });
});
