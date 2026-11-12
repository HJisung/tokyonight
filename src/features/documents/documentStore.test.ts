import { beforeEach, describe, expect, it, vi } from "vitest";
import { readTextFile, writeTextFile } from "@/ipc";
import { documentSource, fileDocumentId } from "./documentId";
import { createDocumentStore } from "./documentStore";
import type { DocumentChangeEvent, DocumentStore } from "./documentStore";

// Rust 쪽 없이 저장소만 검사하도록 파일 읽기·쓰기를 모의로 대체합니다.
vi.mock("@/ipc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ipc")>()),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

const readMock = vi.mocked(readTextFile);
const writeMock = vi.mocked(writeTextFile);

const A = fileDocumentId("/notes/a.md");

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("documentStore", () => {
  let store: DocumentStore;

  beforeEach(() => {
    readMock.mockReset();
    writeMock.mockReset();
    writeMock.mockResolvedValue(undefined);
    store = createDocumentStore();
  });

  describe("열기", () => {
    it("파일을 읽어 수정되지 않은 문서로 연다", async () => {
      readMock.mockResolvedValue("# 제목\n");

      const doc = await store.open(A);

      expect(readMock).toHaveBeenCalledWith("/notes/a.md");
      expect(doc).toEqual({
        id: A,
        kind: "markdown",
        content: "# 제목\n",
        savedContent: "# 제목\n",
        dirty: false,
        viewCount: 1,
      });
      expect(store.getContent(A)).toBe("# 제목\n");
    });

    it("같은 문서를 두 번 열면 다시 읽지 않고 한 버퍼를 공유한다", async () => {
      readMock.mockResolvedValue("처음");

      const first = await store.open(A);
      store.setContent(A, "고친 내용");
      const second = await store.open(A);

      expect(readMock).toHaveBeenCalledTimes(1);
      expect(second.id).toBe(first.id);
      expect(second.content).toBe("고친 내용");
      expect(second.viewCount).toBe(2);
      expect(Object.keys(store.state.getState().documents)).toEqual([A]);
    });

    it("동시에 열어도 한 번만 읽고 한 버퍼를 공유한다", async () => {
      const read = deferred<string>();
      readMock.mockReturnValue(read.promise);

      const opening = Promise.all([store.open(A), store.open(A)]);
      read.resolve("내용");
      await opening;

      expect(readMock).toHaveBeenCalledTimes(1);
      expect(store.get(A)?.viewCount).toBe(2);
    });

    it("읽기에 실패하면 FsError로 reject하고 아무것도 남기지 않는다", async () => {
      readMock.mockRejectedValue({ kind: "notUtf8", message: "UTF-8 아님" });

      await expect(store.open(A)).rejects.toEqual({
        kind: "notUtf8",
        message: "UTF-8 아님",
      });
      expect(store.get(A)).toBeUndefined();

      // 실패한 읽기가 남아 다음 열기를 막지 않습니다.
      readMock.mockResolvedValue("다시");
      await expect(store.open(A)).resolves.toMatchObject({ content: "다시" });
    });

    it("확장자가 .md가 아니면 일반 텍스트로 연다", async () => {
      readMock.mockResolvedValue("");
      const doc = await store.open(fileDocumentId("/notes/README"));
      expect(doc.kind).toBe("text");
    });
  });

  describe("내용 변경과 구독", () => {
    it("한쪽의 변경이 다른 구독자에게 전달된다", async () => {
      readMock.mockResolvedValue("hello");
      await store.open(A);
      await store.open(A);
      const viewA = Symbol("viewA");
      const seenByA: DocumentChangeEvent[] = [];
      const seenByB: DocumentChangeEvent[] = [];
      store.subscribe(A, (event) => seenByA.push(event));
      store.subscribe(A, (event) => seenByB.push(event));

      store.applyChanges(A, [{ from: 5, to: 5, insert: " world" }], viewA);

      const expected = {
        id: A,
        content: "hello world",
        changes: [{ from: 5, to: 5, insert: " world" }],
        origin: viewA,
      };
      expect(seenByB).toEqual([expected]);
      // 변경을 낸 쪽도 받지만 origin으로 자기 변경임을 알 수 있습니다.
      expect(seenByA).toEqual([expected]);
      expect(store.getContent(A)).toBe("hello world");
    });

    it("내용이 디스크 기준과 달라지면 수정됨, 되돌리면 해제된다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);

      store.applyChanges(A, [{ from: 3, to: 3, insert: "d" }]);
      expect(store.get(A)?.dirty).toBe(true);

      store.applyChanges(A, [{ from: 3, to: 4, insert: "" }]);
      expect(store.get(A)?.dirty).toBe(false);
    });

    it("setContent는 전체를 바꾸는 변경 하나로 전달되고, 같은 내용이면 알리지 않는다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      const listener = vi.fn();
      store.subscribe(A, listener);

      store.setContent(A, "abc");
      expect(listener).not.toHaveBeenCalled();

      store.setContent(A, "xyz!");
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        id: A,
        content: "xyz!",
        changes: [{ from: 0, to: 3, insert: "xyz!" }],
        origin: undefined,
      });
    });

    it("구독을 해제하면 더 받지 않는다", async () => {
      readMock.mockResolvedValue("");
      await store.open(A);
      const listener = vi.fn();
      const unsubscribe = store.subscribe(A, listener);

      unsubscribe();
      store.setContent(A, "x");

      expect(listener).not.toHaveBeenCalled();
    });

    it("잘못된 범위의 변경은 거부하고 내용을 바꾸지 않는다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      const listener = vi.fn();
      store.subscribe(A, listener);

      expect(() =>
        store.applyChanges(A, [{ from: 2, to: 9, insert: "" }]),
      ).toThrow(RangeError);
      expect(store.getContent(A)).toBe("abc");
      expect(listener).not.toHaveBeenCalled();
    });

    it("열려 있지 않은 문서는 바꾸거나 구독할 수 없다", () => {
      expect(() => store.setContent(A, "x")).toThrow();
      expect(() => store.subscribe(A, () => {})).toThrow();
    });
  });

  describe("저장", () => {
    it("저장하면 현재 내용을 쓰고 수정됨이 해제된다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      store.setContent(A, "abcd");

      const result = await store.save(A);

      expect(result).toEqual({ ok: true, id: A });
      expect(writeMock).toHaveBeenCalledWith("/notes/a.md", "abcd");
      expect(store.get(A)).toMatchObject({
        content: "abcd",
        savedContent: "abcd",
        dirty: false,
      });
    });

    it("BOM과 CRLF를 바꾸지 않고 받은 그대로 보관하고 쓴다", async () => {
      const original = "\uFEFF첫 줄\r\n둘째 줄\r\n";
      readMock.mockResolvedValue(original);
      await store.open(A);
      expect(store.getContent(A)).toBe(original);

      store.applyChanges(A, [{ from: 1, to: 2, insert: "큰" }]);
      await store.save(A);

      expect(writeMock).toHaveBeenCalledWith(
        "/notes/a.md",
        "\uFEFF큰 줄\r\n둘째 줄\r\n",
      );
    });

    it("저장에 실패하면 수정됨을 유지하고 오류를 돌려준다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      store.setContent(A, "abcd");
      writeMock.mockRejectedValue({
        kind: "permissionDenied",
        message: "읽기 전용",
      });

      const result = await store.save(A);

      expect(result).toEqual({
        ok: false,
        error: { kind: "permissionDenied", message: "읽기 전용" },
      });
      expect(store.get(A)).toMatchObject({
        content: "abcd",
        savedContent: "abc",
        dirty: true,
      });
    });

    it("쓰는 동안 더 고치면 저장 후에도 수정됨이 남는다", async () => {
      readMock.mockResolvedValue("a");
      await store.open(A);
      store.setContent(A, "ab");
      const write = deferred<void>();
      writeMock.mockReturnValue(write.promise);

      const saving = store.save(A);
      await Promise.resolve();
      store.setContent(A, "abc");
      write.resolve();
      await saving;

      expect(writeMock).toHaveBeenCalledWith("/notes/a.md", "ab");
      expect(store.get(A)).toMatchObject({
        content: "abc",
        savedContent: "ab",
        dirty: true,
      });
    });

    it("겹친 저장은 요청한 순서대로 하나씩 쓴다", async () => {
      readMock.mockResolvedValue("");
      await store.open(A);
      const first = deferred<void>();
      writeMock.mockReturnValueOnce(first.promise);

      store.setContent(A, "1");
      const savingFirst = store.save(A);
      await Promise.resolve();
      store.setContent(A, "2");
      const savingSecond = store.save(A);
      await Promise.resolve();

      expect(writeMock).toHaveBeenCalledTimes(1);
      first.resolve();
      await Promise.all([savingFirst, savingSecond]);

      expect(writeMock.mock.calls).toEqual([
        ["/notes/a.md", "1"],
        ["/notes/a.md", "2"],
      ]);
      expect(store.get(A)?.dirty).toBe(false);
    });

    it("열려 있지 않은 문서는 notOpen을 돌려준다", async () => {
      await expect(store.save(A)).resolves.toMatchObject({
        ok: false,
        error: { kind: "notOpen" },
      });
      expect(writeMock).not.toHaveBeenCalled();
    });
  });

  describe("임시 메모", () => {
    it("파일 없이 만들고, 내용이 생기면 수정됨이 된다", () => {
      const scratch = store.createScratch();

      expect(documentSource(scratch.id).type).toBe("scratch");
      expect(scratch).toMatchObject({
        kind: "text",
        content: "",
        savedContent: null,
        dirty: false,
        viewCount: 1,
      });
      expect(readMock).not.toHaveBeenCalled();

      store.setContent(scratch.id, "메모");
      expect(store.get(scratch.id)?.dirty).toBe(true);
    });

    it("임시 메모끼리 ID가 겹치지 않는다", () => {
      expect(store.createScratch().id).not.toBe(store.createScratch().id);
    });

    it("이미 있는 임시 메모는 ID로 다시 열 수 있고, 없는 ID는 거부한다", async () => {
      const scratch = store.createScratch();

      await expect(store.open(scratch.id)).resolves.toMatchObject({
        id: scratch.id,
        viewCount: 2,
      });

      store.close(scratch.id);
      store.close(scratch.id);
      await expect(store.open(scratch.id)).rejects.toMatchObject({
        kind: "notOpen",
      });
    });

    it("종류를 바꿀 수 있지만 파일 문서의 종류는 바꾸지 않는다", async () => {
      const scratch = store.createScratch();
      expect(store.setKind(scratch.id, "markdown")).toBe(true);
      expect(store.get(scratch.id)?.kind).toBe("markdown");

      readMock.mockResolvedValue("");
      await store.open(A);
      expect(store.setKind(A, "text")).toBe(false);
      expect(store.get(A)?.kind).toBe("markdown");
    });

    it("경로가 없으므로 그냥 저장하면 noPath를 돌려주고 쓰지 않는다", async () => {
      const scratch = store.createScratch();
      store.setContent(scratch.id, "메모");

      await expect(store.save(scratch.id)).resolves.toMatchObject({
        ok: false,
        error: { kind: "noPath" },
      });
      expect(writeMock).not.toHaveBeenCalled();
      expect(store.get(scratch.id)?.dirty).toBe(true);
    });
  });

  describe("다른 이름으로 저장", () => {
    it("임시 메모를 저장하면 경로가 있는 문서가 되고 구독이 유지된다", async () => {
      const scratch = store.createScratch();
      store.setContent(scratch.id, "메모");
      const changes = vi.fn();
      const idChanges = vi.fn();
      store.subscribe(scratch.id, changes);
      store.subscribeIdChanges(idChanges);
      const target = fileDocumentId("/notes/memo.md");

      const result = await store.saveAs(scratch.id, "/notes/memo.md");

      expect(result).toEqual({ ok: true, id: target });
      expect(writeMock).toHaveBeenCalledWith("/notes/memo.md", "메모");
      expect(store.get(scratch.id)).toBeUndefined();
      expect(store.get(target)).toEqual({
        id: target,
        kind: "markdown",
        content: "메모",
        savedContent: "메모",
        dirty: false,
        viewCount: 1,
      });
      expect(idChanges).toHaveBeenCalledWith({ from: scratch.id, to: target });

      store.setContent(target, "메모 2");
      expect(changes).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: target, content: "메모 2" }),
      );
    });

    it("파일 문서는 새 경로의 문서로 바뀐다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      store.setContent(A, "abcd");
      const target = fileDocumentId("/notes/b.txt");

      const result = await store.saveAs(A, "/notes/b.txt");

      expect(result).toEqual({ ok: true, id: target });
      expect(writeMock.mock.calls).toEqual([["/notes/b.txt", "abcd"]]);
      expect(store.get(A)).toBeUndefined();
      expect(store.get(target)).toMatchObject({ kind: "text", dirty: false });
    });

    it("자기 경로로 저장하면 그냥 저장과 같다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      store.setContent(A, "abcd");

      await expect(store.saveAs(A, "/notes/a.md")).resolves.toEqual({
        ok: true,
        id: A,
      });
      expect(store.get(A)?.dirty).toBe(false);
    });

    it("실패하면 원래 문서와 수정됨 상태가 그대로 남는다", async () => {
      const scratch = store.createScratch();
      store.setContent(scratch.id, "메모");
      writeMock.mockRejectedValue({ kind: "outOfScope", message: "범위 밖" });

      const result = await store.saveAs(scratch.id, "/notes/memo.md");

      expect(result).toEqual({
        ok: false,
        error: { kind: "outOfScope", message: "범위 밖" },
      });
      expect(store.get(scratch.id)).toMatchObject({
        content: "메모",
        dirty: true,
      });
      expect(store.get(fileDocumentId("/notes/memo.md"))).toBeUndefined();
    });

    it("이미 다른 문서로 열려 있는 경로에는 쓰지 않는다", async () => {
      readMock.mockResolvedValue("남의 내용");
      await store.open(A);
      const scratch = store.createScratch();
      store.setContent(scratch.id, "메모");

      await expect(store.saveAs(scratch.id, "/notes/a.md")).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({ kind: "alreadyOpen" }),
      });
      expect(writeMock).not.toHaveBeenCalled();
      expect(store.getContent(A)).toBe("남의 내용");
      expect(store.get(scratch.id)?.dirty).toBe(true);
    });
  });

  describe("닫기", () => {
    it("보는 뷰가 남아 있으면 정리하지 않는다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      await store.open(A);

      expect(store.close(A)).toEqual({ status: "released", viewCount: 1 });
      expect(store.getContent(A)).toBe("abc");
    });

    it("마지막 뷰가 닫히면 정리하고, 다시 열면 새로 읽는다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      const listener = vi.fn();
      store.subscribe(A, listener);

      expect(store.close(A)).toEqual({ status: "closed" });
      expect(store.get(A)).toBeUndefined();

      readMock.mockResolvedValue("디스크의 새 내용");
      await store.open(A);
      store.setContent(A, "x");

      expect(readMock).toHaveBeenCalledTimes(2);
      expect(listener).not.toHaveBeenCalled();
    });

    it("저장하지 않은 내용이 있으면 마지막 뷰를 조용히 닫지 않는다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      store.setContent(A, "abcd");

      expect(store.close(A)).toEqual({ status: "dirty" });
      expect(store.get(A)).toMatchObject({ content: "abcd", viewCount: 1 });

      expect(store.close(A, { discard: true })).toEqual({ status: "closed" });
      expect(store.get(A)).toBeUndefined();
    });

    it("수정된 문서라도 다른 뷰가 남아 있으면 뷰 하나는 닫을 수 있다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      await store.open(A);
      store.setContent(A, "abcd");

      expect(store.close(A)).toEqual({ status: "released", viewCount: 1 });
      expect(store.getContent(A)).toBe("abcd");
    });

    it("열려 있지 않은 문서는 notOpen", () => {
      expect(store.close(A)).toEqual({ status: "notOpen" });
    });
  });

  describe("경로 변경 반영", () => {
    it("파일 이름이 바뀌면 ID와 종류가 따라가고 내용·수정됨·구독은 그대로다", async () => {
      readMock.mockResolvedValue("abc");
      await store.open(A);
      store.setContent(A, "abcd");
      const changes = vi.fn();
      const idChanges = vi.fn();
      store.subscribe(A, changes);
      store.subscribeIdChanges(idChanges);
      const target = fileDocumentId("/notes/b.txt");

      const result = store.applyPathChange("/notes/a.md", "/notes/b.txt");

      expect(result).toEqual({
        moved: [{ from: A, to: target }],
        conflicts: [],
      });
      expect(idChanges).toHaveBeenCalledWith({ from: A, to: target });
      expect(store.get(A)).toBeUndefined();
      expect(store.get(target)).toEqual({
        id: target,
        kind: "text",
        content: "abcd",
        savedContent: "abc",
        dirty: true,
        viewCount: 1,
      });

      await store.save(target);
      expect(writeMock).toHaveBeenCalledWith("/notes/b.txt", "abcd");

      store.setContent(target, "z");
      expect(changes).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: target, content: "z" }),
      );
    });

    it("폴더가 바뀌면 그 아래 문서만 옮긴다", async () => {
      readMock.mockResolvedValue("");
      const inside = fileDocumentId("/notes/sub/a.md");
      const sibling = fileDocumentId("/notes/sub2/a.md");
      const scratch = store.createScratch();
      await store.open(inside);
      await store.open(sibling);

      const result = store.applyPathChange("/notes/sub/", "/notes/moved");

      const target = fileDocumentId("/notes/moved/a.md");
      expect(result.moved).toEqual([{ from: inside, to: target }]);
      expect(store.get(target)).toBeDefined();
      expect(store.get(sibling)).toBeDefined();
      expect(store.get(scratch.id)).toBeDefined();
    });

    it("Windows 경로 구분자도 폴더 아래로 본다", async () => {
      readMock.mockResolvedValue("");
      const inside = fileDocumentId("C:\\notes\\sub\\a.md");
      await store.open(inside);

      store.applyPathChange("C:\\notes\\sub", "C:\\notes\\moved");

      expect(store.get(fileDocumentId("C:\\notes\\moved\\a.md"))).toBeDefined();
    });

    it("새 경로가 이미 다른 문서로 열려 있으면 옮기지 않고 알린다", async () => {
      readMock.mockResolvedValue("");
      const other = fileDocumentId("/notes/b.md");
      await store.open(A);
      await store.open(other);
      store.setContent(other, "남의 내용");

      const result = store.applyPathChange("/notes/a.md", "/notes/b.md");

      expect(result).toEqual({
        moved: [],
        conflicts: [{ from: A, to: other }],
      });
      expect(store.get(A)).toBeDefined();
      expect(store.getContent(other)).toBe("남의 내용");
    });

    it("대기 중인 저장은 바뀐 경로에 쓴다", async () => {
      readMock.mockResolvedValue("");
      await store.open(A);
      const first = deferred<void>();
      writeMock.mockReturnValueOnce(first.promise);
      store.setContent(A, "1");
      const savingFirst = store.save(A);
      await Promise.resolve();
      store.setContent(A, "2");
      const savingSecond = store.save(A);

      first.resolve();
      await savingFirst;
      store.applyPathChange("/notes/a.md", "/notes/b.md");
      const result = await savingSecond;

      expect(result).toEqual({ ok: true, id: fileDocumentId("/notes/b.md") });
      expect(writeMock.mock.calls[1]).toEqual(["/notes/b.md", "2"]);
    });
  });
});
