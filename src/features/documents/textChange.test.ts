import { describe, expect, it } from "vitest";
import { applyTextChanges } from "./textChange";

describe("applyTextChanges", () => {
  it("삽입·삭제·교체를 변경 전 위치 기준으로 적용한다", () => {
    expect(
      applyTextChanges("hello world", [
        { from: 0, to: 0, insert: ">> " },
        { from: 0, to: 5, insert: "HELLO" },
        { from: 5, to: 11, insert: "" },
      ]),
    ).toBe(">> HELLO");
  });

  it("바꾸지 않은 CRLF와 BOM은 그대로 둔다", () => {
    const before = "﻿a\r\nb\r\n";
    expect(applyTextChanges(before, [{ from: 1, to: 2, insert: "A" }])).toBe(
      "﻿A\r\nb\r\n",
    );
  });

  it("변경이 없으면 같은 내용을 돌려준다", () => {
    expect(applyTextChanges("abc", [])).toBe("abc");
  });

  it("범위를 벗어나거나 겹치거나 순서가 어긋나면 거부한다", () => {
    expect(() =>
      applyTextChanges("abc", [{ from: 2, to: 4, insert: "" }]),
    ).toThrow(RangeError);
    expect(() =>
      applyTextChanges("abc", [{ from: 2, to: 1, insert: "" }]),
    ).toThrow(RangeError);
    expect(() =>
      applyTextChanges("abc", [
        { from: 0, to: 2, insert: "" },
        { from: 1, to: 3, insert: "" },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      applyTextChanges("abc", [{ from: 0.5, to: 1, insert: "" }]),
    ).toThrow(RangeError);
  });
});
