import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { readTextFile, toFsError, writeTextFile } from "@/ipc";
import type { FsError } from "@/ipc";
import {
  documentSource,
  fileDocumentId,
  kindFromPath,
  scratchDocumentId,
} from "./documentId";
import type { DocumentId, DocumentKind } from "./documentId";
import { applyTextChanges } from "./textChange";
import type { TextChange } from "./textChange";

/** 열려 있는 문서 하나. 값은 바뀌지 않고, 변경될 때마다 새 객체로 교체됩니다. */
export type DocumentState = {
  id: DocumentId;
  kind: DocumentKind;
  /** 현재 내용. 읽은 그대로이며 줄바꿈(CRLF/LF)과 BOM을 바꾸지 않습니다. */
  content: string;
  /** 디스크 기준 내용(마지막으로 읽었거나 저장한 내용). 아직 파일이 없는 임시 메모는 `null`. */
  savedContent: string | null;
  /** 현재 내용이 디스크 기준 내용과 다른지. 임시 메모는 내용이 있으면 수정됨입니다. */
  dirty: boolean;
  /** 이 문서를 보고 있는 뷰의 수. */
  viewCount: number;
};

export type DocumentsState = {
  documents: Readonly<Record<string, DocumentState>>;
};

/** 변경을 낸 쪽을 구분하는 표시. 구독자가 자기가 낸 변경을 건너뛰는 데 씁니다. */
export type ChangeOrigin = string | symbol;

export type DocumentChangeEvent = {
  id: DocumentId;
  /** 변경을 적용한 뒤의 내용. */
  content: string;
  /** 변경 전 내용 기준의 변경 묶음. */
  changes: readonly TextChange[];
  origin: ChangeOrigin | undefined;
};

export type DocumentChangeListener = (event: DocumentChangeEvent) => void;

export type DocumentIdChange = { from: DocumentId; to: DocumentId };

export type DocumentIdChangeListener = (change: DocumentIdChange) => void;

/**
 * 저장소 자체의 오류.
 *
 * - `notOpen`: 열려 있지 않은 문서
 * - `noPath`: 경로가 없는 임시 메모를 그냥 저장하려 함(다른 이름으로 저장해야 함)
 * - `alreadyOpen`: 다른 이름으로 저장할 경로가 이미 다른 문서로 열려 있음
 */
export type DocumentStoreError = {
  kind: "notOpen" | "noPath" | "alreadyOpen";
  message: string;
};

export type DocumentError = FsError | DocumentStoreError;

/** 성공하면 저장 후의 문서 ID(다른 이름으로 저장하면 바뀜)를 돌려줍니다. */
export type SaveResult =
  { ok: true; id: DocumentId } | { ok: false; error: DocumentError };

/**
 * - `released`: 뷰 하나가 빠졌고 다른 뷰가 남아 있음
 * - `closed`: 마지막 뷰가 빠져 문서를 정리함
 * - `dirty`: 마지막 뷰인데 저장하지 않은 내용이 있어 닫지 않음. 아무것도 바뀌지 않았습니다.
 *   저장한 뒤 다시 닫거나, 사용자가 버리기로 했다면 `{ discard: true }`로 닫습니다.
 * - `notOpen`: 열려 있지 않은 문서
 */
export type CloseResult =
  | { status: "released"; viewCount: number }
  | { status: "closed" }
  | { status: "dirty" }
  | { status: "notOpen" };

export type CloseOptions = {
  /** 저장하지 않은 내용을 버리고 닫습니다. 사용자가 버리기를 고른 뒤에만 씁니다. */
  discard?: boolean;
};

export type PathChangeResult = {
  /** 새 경로로 옮겨진 문서. */
  moved: DocumentIdChange[];
  /** 새 경로가 이미 다른 문서로 열려 있어 옮기지 못한 문서. */
  conflicts: DocumentIdChange[];
};

export type DocumentStore = {
  /** React에서 구독할 때 쓰는 Zustand store. 값을 직접 바꾸지 않습니다. */
  state: StoreApi<DocumentsState>;
  /**
   * 문서를 열고 뷰 수를 하나 늘립니다. 이미 열려 있으면 파일을 다시 읽지 않고 같은 문서를 돌려줍니다.
   * 파일을 읽지 못하면 `FsError`로, 없는 임시 메모 ID면 `notOpen` 오류로 reject합니다.
   * 연 횟수만큼 `close`를 불러야 정리됩니다.
   */
  open(id: DocumentId): Promise<DocumentState>;
  /** 빈 임시 메모를 만들고 뷰 수 1로 엽니다. */
  createScratch(kind?: DocumentKind): DocumentState;
  get(id: DocumentId): DocumentState | undefined;
  getContent(id: DocumentId): string | undefined;
  /** 변경 묶음을 적용하고 구독자에게 알립니다. 열려 있지 않거나 범위가 잘못되면 던집니다. */
  applyChanges(
    id: DocumentId,
    changes: readonly TextChange[],
    origin?: ChangeOrigin,
  ): void;
  /** 내용 전체를 바꿉니다. 구독자에게는 전체를 바꾸는 변경 하나로 전달됩니다. */
  setContent(id: DocumentId, content: string, origin?: ChangeOrigin): void;
  /** 이 문서의 내용 변경을 구독합니다. 문서 ID가 바뀌어도 구독은 유지됩니다. */
  subscribe(id: DocumentId, listener: DocumentChangeListener): () => void;
  /** 문서 ID가 바뀔 때(다른 이름으로 저장, 경로 변경) 알림을 받습니다. */
  subscribeIdChanges(listener: DocumentIdChangeListener): () => void;
  /** 임시 메모의 종류를 바꿉니다. 파일 문서는 확장자가 종류를 정하므로 바꾸지 않고 `false`. */
  setKind(id: DocumentId, kind: DocumentKind): boolean;
  /** 현재 내용을 문서의 경로에 씁니다. 실패하면 수정됨 상태가 그대로 남습니다. */
  save(id: DocumentId): Promise<SaveResult>;
  /**
   * 현재 내용을 `path`에 쓰고 문서를 그 경로의 파일 문서로 바꿉니다(임시 메모는 일반 문서가 됨).
   * 기존 파일을 덮어쓸지는 경로를 고르는 저장 대화상자(`pickSaveFile`)가 묻습니다.
   */
  saveAs(id: DocumentId, path: string): Promise<SaveResult>;
  close(id: DocumentId, options?: CloseOptions): CloseResult;
  /**
   * 파일이나 폴더의 경로가 `from`에서 `to`로 바뀐 것을 반영합니다.
   * `from`과 같거나 그 아래에 있는 열린 문서의 ID가 새 경로로 바뀝니다. 내용과 수정됨 상태는 그대로입니다.
   */
  applyPathChange(from: string, to: string): PathChangeResult;
};

function isDirty(content: string, savedContent: string | null): boolean {
  return savedContent === null ? content.length > 0 : content !== savedContent;
}

function trimTrailingSeparators(path: string): string {
  let end = path.length;
  while (end > 1 && (path[end - 1] === "/" || path[end - 1] === "\\")) {
    end -= 1;
  }
  return path.slice(0, end);
}

/** `path`가 `from`과 같거나 그 아래면 `to` 아래의 새 경로, 아니면 `null`. */
function movedPath(path: string, from: string, to: string): string | null {
  if (path === from) {
    return to;
  }
  if (path.startsWith(from)) {
    const next = path[from.length];
    if (next === "/" || next === "\\") {
      return to + path.slice(from.length);
    }
  }
  return null;
}

function storeError(
  kind: DocumentStoreError["kind"],
  message: string,
): DocumentStoreError {
  return { kind, message };
}

export function createDocumentStore(): DocumentStore {
  const state = createStore<DocumentsState>(() => ({ documents: {} }));

  // 문서 ID가 바뀌어도(다른 이름으로 저장, 경로 변경) 구독과 진행 중인 저장이 따라가도록
  // 문서마다 바뀌지 않는 내부 번호를 둡니다.
  let nextKey = 1;
  const keyById = new Map<DocumentId, number>();
  const idByKey = new Map<number, DocumentId>();
  const changeListeners = new Map<number, Set<DocumentChangeListener>>();
  const idChangeListeners = new Set<DocumentIdChangeListener>();
  /** 문서별로 저장을 한 번에 하나씩 차례로 실행하기 위한 마지막 저장 작업. */
  const saveTails = new Map<number, Promise<unknown>>();
  /** 같은 파일을 동시에 열 때 읽기를 한 번만 하기 위한 진행 중인 읽기. */
  const pendingReads = new Map<DocumentId, Promise<string>>();

  function get(id: DocumentId): DocumentState | undefined {
    return state.getState().documents[id];
  }

  function put(doc: DocumentState): void {
    state.setState((current) => ({
      documents: { ...current.documents, [doc.id]: doc },
    }));
  }

  function remove(id: DocumentId): void {
    state.setState((current) => {
      const documents = { ...current.documents };
      delete documents[id];
      return { documents };
    });
  }

  function insert(doc: DocumentState): void {
    const key = nextKey;
    nextKey += 1;
    keyById.set(doc.id, key);
    idByKey.set(key, doc.id);
    put(doc);
  }

  function retain(doc: DocumentState): DocumentState {
    const next = { ...doc, viewCount: doc.viewCount + 1 };
    put(next);
    return next;
  }

  function currentByKey(key: number): DocumentState | undefined {
    const id = idByKey.get(key);
    return id === undefined ? undefined : get(id);
  }

  /** 문서의 ID를 바꾸고 `patch`를 함께 적용합니다. 구독과 진행 중인 저장은 그대로 따라갑니다. */
  function changeId(
    doc: DocumentState,
    to: DocumentId,
    patch: Partial<Pick<DocumentState, "kind" | "savedContent">>,
  ): DocumentState {
    const from = doc.id;
    const key = keyById.get(from);
    const savedContent =
      patch.savedContent === undefined ? doc.savedContent : patch.savedContent;
    const next: DocumentState = {
      ...doc,
      id: to,
      kind: patch.kind ?? doc.kind,
      savedContent,
      dirty: isDirty(doc.content, savedContent),
    };
    if (key !== undefined) {
      keyById.delete(from);
      keyById.set(to, key);
      idByKey.set(key, to);
    }
    state.setState((current) => {
      const documents = { ...current.documents };
      delete documents[from];
      documents[to] = next;
      return { documents };
    });
    for (const listener of [...idChangeListeners]) {
      listener({ from, to });
    }
    return next;
  }

  async function open(id: DocumentId): Promise<DocumentState> {
    const existing = get(id);
    if (existing) {
      return retain(existing);
    }
    const source = documentSource(id);
    if (source.type === "scratch") {
      throw storeError("notOpen", "열려 있지 않은 임시 메모입니다.");
    }

    let read = pendingReads.get(id);
    if (!read) {
      read = readTextFile(source.path).finally(() => {
        pendingReads.delete(id);
      });
      pendingReads.set(id, read);
    }
    let content: string;
    try {
      content = await read;
    } catch (error) {
      throw toFsError(error);
    }

    // 읽는 동안 같은 문서를 연 다른 호출이 먼저 넣었으면 그 버퍼를 공유합니다.
    const opened = get(id);
    if (opened) {
      return retain(opened);
    }
    const doc: DocumentState = {
      id,
      kind: kindFromPath(source.path),
      content,
      savedContent: content,
      dirty: false,
      viewCount: 1,
    };
    insert(doc);
    return doc;
  }

  function createScratch(kind: DocumentKind = "text"): DocumentState {
    const doc: DocumentState = {
      id: scratchDocumentId(crypto.randomUUID()),
      kind,
      content: "",
      savedContent: null,
      dirty: false,
      viewCount: 1,
    };
    insert(doc);
    return doc;
  }

  function applyChanges(
    id: DocumentId,
    changes: readonly TextChange[],
    origin?: ChangeOrigin,
  ): void {
    const doc = get(id);
    if (!doc) {
      throw new Error(`열려 있지 않은 문서입니다: ${id}`);
    }
    if (changes.length === 0) {
      return;
    }
    const content = applyTextChanges(doc.content, changes);
    put({ ...doc, content, dirty: isDirty(content, doc.savedContent) });

    const key = keyById.get(id);
    const listeners = key === undefined ? undefined : changeListeners.get(key);
    if (listeners) {
      const event: DocumentChangeEvent = { id, content, changes, origin };
      for (const listener of [...listeners]) {
        listener(event);
      }
    }
  }

  function setContent(
    id: DocumentId,
    content: string,
    origin?: ChangeOrigin,
  ): void {
    const doc = get(id);
    if (!doc) {
      throw new Error(`열려 있지 않은 문서입니다: ${id}`);
    }
    if (doc.content === content) {
      return;
    }
    applyChanges(
      id,
      [{ from: 0, to: doc.content.length, insert: content }],
      origin,
    );
  }

  function subscribe(
    id: DocumentId,
    listener: DocumentChangeListener,
  ): () => void {
    const key = keyById.get(id);
    if (key === undefined) {
      throw new Error(`열려 있지 않은 문서입니다: ${id}`);
    }
    let listeners = changeListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      changeListeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      const current = changeListeners.get(key);
      if (current) {
        current.delete(listener);
        if (current.size === 0) {
          changeListeners.delete(key);
        }
      }
    };
  }

  function subscribeIdChanges(listener: DocumentIdChangeListener): () => void {
    idChangeListeners.add(listener);
    return () => {
      idChangeListeners.delete(listener);
    };
  }

  function setKind(id: DocumentId, kind: DocumentKind): boolean {
    const doc = get(id);
    if (!doc || documentSource(id).type !== "scratch") {
      return false;
    }
    if (doc.kind !== kind) {
      put({ ...doc, kind });
    }
    return true;
  }

  /** 같은 문서의 저장을 요청한 순서대로 하나씩 실행합니다. 오래된 쓰기가 새 쓰기를 덮지 않게 합니다. */
  function enqueueSave(
    id: DocumentId,
    task: (key: number) => Promise<SaveResult>,
  ): Promise<SaveResult> {
    const key = keyById.get(id);
    if (key === undefined) {
      return Promise.resolve({
        ok: false,
        error: storeError("notOpen", "열려 있지 않은 문서입니다."),
      });
    }
    const previous = saveTails.get(key) ?? Promise.resolve();
    const run = previous.then(() => task(key));
    const tail = run.catch(() => undefined);
    saveTails.set(key, tail);
    void tail.then(() => {
      if (saveTails.get(key) === tail) {
        saveTails.delete(key);
      }
    });
    return run;
  }

  /** `content`를 `path`에 쓰고, 실패하면 오류를 돌려줍니다. */
  async function write(path: string, content: string): Promise<FsError | null> {
    try {
      await writeTextFile(path, content);
      return null;
    } catch (error) {
      return toFsError(error);
    }
  }

  async function runSave(key: number): Promise<SaveResult> {
    const doc = currentByKey(key);
    if (!doc) {
      return {
        ok: false,
        error: storeError("notOpen", "열려 있지 않은 문서입니다."),
      };
    }
    const source = documentSource(doc.id);
    if (source.type === "scratch") {
      return {
        ok: false,
        error: storeError(
          "noPath",
          "임시 메모는 저장할 위치를 먼저 정해야 합니다.",
        ),
      };
    }

    // 쓰는 동안 내용이 더 바뀔 수 있으므로, 실제로 쓴 내용을 디스크 기준으로 삼습니다.
    const written = doc.content;
    const error = await write(source.path, written);
    if (error) {
      return { ok: false, error };
    }
    const after = currentByKey(key);
    if (after) {
      put({
        ...after,
        savedContent: written,
        dirty: isDirty(after.content, written),
      });
    }
    return { ok: true, id: after?.id ?? doc.id };
  }

  async function runSaveAs(key: number, path: string): Promise<SaveResult> {
    const doc = currentByKey(key);
    if (!doc) {
      return {
        ok: false,
        error: storeError("notOpen", "열려 있지 않은 문서입니다."),
      };
    }
    const target = fileDocumentId(path);
    if (target === doc.id) {
      return runSave(key);
    }
    const alreadyOpen: SaveResult = {
      ok: false,
      error: storeError(
        "alreadyOpen",
        "그 경로의 파일이 이미 다른 문서로 열려 있습니다.",
      ),
    };
    // 한 경로에 버퍼가 둘이 되면 서로의 내용을 덮어쓰게 되므로 쓰기 전에 막습니다.
    if (get(target) || pendingReads.has(target)) {
      return alreadyOpen;
    }

    const written = doc.content;
    const error = await write(path, written);
    if (error) {
      return { ok: false, error };
    }
    const after = currentByKey(key);
    if (!after) {
      return { ok: true, id: target };
    }
    if (after.id === target) {
      put({
        ...after,
        savedContent: written,
        dirty: isDirty(after.content, written),
      });
      return { ok: true, id: target };
    }
    if (get(target)) {
      return alreadyOpen;
    }
    changeId(after, target, {
      kind: kindFromPath(path),
      savedContent: written,
    });
    return { ok: true, id: target };
  }

  function close(id: DocumentId, options: CloseOptions = {}): CloseResult {
    const doc = get(id);
    if (!doc) {
      return { status: "notOpen" };
    }
    if (doc.viewCount > 1) {
      const viewCount = doc.viewCount - 1;
      put({ ...doc, viewCount });
      return { status: "released", viewCount };
    }
    if (doc.dirty && !options.discard) {
      return { status: "dirty" };
    }
    const key = keyById.get(id);
    if (key !== undefined) {
      keyById.delete(id);
      idByKey.delete(key);
      changeListeners.delete(key);
    }
    remove(id);
    return { status: "closed" };
  }

  function applyPathChange(from: string, to: string): PathChangeResult {
    const fromPath = trimTrailingSeparators(from);
    const toPath = trimTrailingSeparators(to);
    const result: PathChangeResult = { moved: [], conflicts: [] };
    if (fromPath === toPath) {
      return result;
    }
    for (const doc of Object.values(state.getState().documents)) {
      const source = documentSource(doc.id);
      if (source.type !== "file") {
        continue;
      }
      const path = movedPath(source.path, fromPath, toPath);
      if (path === null) {
        continue;
      }
      const target = fileDocumentId(path);
      const change = { from: doc.id, to: target };
      if (get(target)) {
        result.conflicts.push(change);
        continue;
      }
      changeId(doc, target, { kind: kindFromPath(path) });
      result.moved.push(change);
    }
    return result;
  }

  return {
    state,
    open,
    createScratch,
    get,
    getContent: (id) => get(id)?.content,
    applyChanges,
    setContent,
    subscribe,
    subscribeIdChanges,
    setKind,
    save: (id) => enqueueSave(id, runSave),
    saveAs: (id, path) => enqueueSave(id, (key) => runSaveAs(key, path)),
    close,
    applyPathChange,
  };
}

/** 앱 전체가 함께 쓰는 문서 저장소. */
export const documents: DocumentStore = createDocumentStore();
