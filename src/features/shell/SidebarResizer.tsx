import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { SIDEBAR_WIDTH } from "./sidebarWidth";

type SidebarResizerProps = {
  /** 지금 사이드바 너비(px) */
  width: number;
  /** 원하는 새 너비. 범위 제한은 받는 쪽에서 합니다. */
  onResize: (width: number) => void;
  onReset: () => void;
  /** 조절 대상 사이드바 요소의 id */
  controls: string;
};

type DragStart = { pointerX: number; width: number };

/** 사이드바와 본문 사이의 경계선. 끌거나 방향키로 너비를 바꾸고, 두 번 누르면 기본 너비로 돌아갑니다. */
export function SidebarResizer({
  width,
  onResize,
  onReset,
  controls,
}: SidebarResizerProps) {
  const dragStart = useRef<DragStart | null>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    // 끄는 동안 본문 글자가 선택되지 않게 합니다.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStart.current = { pointerX: event.clientX, width };
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) {
      return;
    }
    onResize(start.width + event.clientX - start.pointerX);
  };

  const endDrag = () => {
    dragStart.current = null;
    setDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = widthForKey(event.key, width);
    if (next === null) {
      return;
    }
    event.preventDefault();
    onResize(next);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="사이드바 너비 조절"
      aria-controls={controls}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      data-dragging={dragging ? "" : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className={cn(
        // 보이는 선은 1px, 잡는 영역은 양옆으로 넓힙니다.
        "relative z-10 w-px shrink-0 cursor-col-resize touch-none bg-border outline-none select-none",
        "after:absolute after:inset-y-0 after:-right-1 after:-left-1",
        "transition-colors hover:bg-ring focus-visible:bg-ring data-dragging:bg-primary",
      )}
    />
  );
}

function widthForKey(key: string, width: number): number | null {
  switch (key) {
    case "ArrowLeft":
      return width - SIDEBAR_WIDTH.step;
    case "ArrowRight":
      return width + SIDEBAR_WIDTH.step;
    case "Home":
      return SIDEBAR_WIDTH.min;
    case "End":
      return SIDEBAR_WIDTH.max;
    default:
      return null;
  }
}
