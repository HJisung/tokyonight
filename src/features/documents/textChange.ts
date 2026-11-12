/**
 * 편집기 라이브러리와 무관한 내용 변경 하나.
 * 변경 전 내용의 `from`부터 `to`까지(UTF-16 코드 단위 위치)를 `insert`로 바꿉니다.
 */
export type TextChange = {
  from: number;
  to: number;
  insert: string;
};

/**
 * 변경 묶음을 적용한 새 내용을 돌려줍니다. 모든 위치는 변경 전 내용 기준이고,
 * 앞에서부터 순서대로이며 서로 겹치지 않아야 합니다. 어긋나면 `RangeError`를 던집니다.
 * 바꾸지 않은 부분(줄바꿈, BOM 포함)은 그대로 남습니다.
 */
export function applyTextChanges(
  content: string,
  changes: readonly TextChange[],
): string {
  let result = "";
  let cursor = 0;
  for (const { from, to, insert } of changes) {
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < cursor ||
      to < from ||
      to > content.length
    ) {
      throw new RangeError(
        `내용 변경 범위가 잘못되었습니다: ${from}~${to} (길이 ${content.length})`,
      );
    }
    result += content.slice(cursor, from) + insert;
    cursor = to;
  }
  return result + content.slice(cursor);
}
