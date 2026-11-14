import { create } from 'zustand'
import {
  closeLeaf,
  isValidLayout,
  leaves,
  makeLeaf,
  mapLeaves,
  newId,
  setSizes,
  splitLeaf,
  updateLeaf
} from './shared/layout'
import { basename } from './shared/paths'
import type {
  DirEntry,
  DocKind,
  DocRef,
  EditMode,
  FolderSession,
  Leaf,
  ScratchMeta,
  Split,
  Workspace
} from './shared/types'

/* ───────────── 문서 상태(화면에 보이는 요약) ───────────── */

export type DocStatus = 'loading' | 'ready' | 'conflict' | 'missing' | 'error'

export interface DocInfo {
  key: string
  kind: DocKind
  status: DocStatus
  /** 한 번이라도 내용을 불러왔는지. false면 편집기를 만들 수 없다. */
  hasText: boolean
  dirty: boolean
  saving: boolean
  saveError: string | null
  reason: string | null
}

/* ───────────── 모달·알림 ───────────── */

export interface ModalButton {
  id: string
  label: string
  kind?: 'primary' | 'danger'
}

export interface ConfirmModal {
  type: 'confirm'
  id: number
  title: string
  message?: string
  details?: string[]
  buttons: ModalButton[]
  resolve: (id: string | null) => void
}

export interface PromptModal {
  type: 'prompt'
  id: number
  title: string
  label?: string
  initial: string
  /** 처음에 선택해 둘 범위의 끝(확장자 앞까지 등) */
  selectEnd?: number
  okLabel?: string
  /** 오류 문구를 돌려주면 창을 닫지 않고 보여준다. null이면 성공. */
  submit: (value: string) => Promise<string | null> | string | null
  resolve: (value: string | null) => void
}

export type Modal = ConfirmModal | PromptModal

export interface Toast {
  id: number
  kind: 'info' | 'error'
  text: string
}

export interface Reveal {
  leafId: string
  line: number
  query?: string
}

/* ───────────── 순수 도구 ───────────── */

export const docKey = (ref: DocRef): string =>
  ref.type === 'file' ? `file:${ref.path}` : `scratch:${ref.id}`

export function allLeaves(workspaces: Workspace[]): Leaf[] {
  return workspaces.flatMap((w) => leaves(w.layout))
}

export function referencedKeys(workspaces: Workspace[]): Set<string> {
  const keys = new Set<string>()
  for (const leaf of allLeaves(workspaces)) if (leaf.doc) keys.add(docKey(leaf.doc))
  return keys
}

/** 모든 영역의 문서 참조를 바꾼다. fn이 null을 돌려주면 그 영역을 비운다. */
export function retarget(workspaces: Workspace[], fn: (ref: DocRef) => DocRef | null): Workspace[] {
  return workspaces.map((w) => ({
    ...w,
    layout: mapLeaves(w.layout, (leaf) => {
      if (!leaf.doc) return leaf
      const next = fn(leaf.doc)
      return next === leaf.doc ? leaf : { ...leaf, doc: next }
    })
  }))
}

export function patchWorkspace(workspaces: Workspace[], id: string, fn: (w: Workspace) => Workspace): Workspace[] {
  return workspaces.map((w) => (w.id === id ? fn(w) : w))
}

export function setLeafDoc(workspaces: Workspace[], wsId: string, leafId: string, doc: DocRef | null): Workspace[] {
  return patchWorkspace(workspaces, wsId, (w) => ({ ...w, layout: updateLeaf(w.layout, leafId, { doc }) }))
}

/** 영역을 닫는다. 마지막 영역이면 빈 영역 하나를 남긴다. */
export function closeLeafIn(workspaces: Workspace[], wsId: string, leafId: string): Workspace[] {
  return patchWorkspace(workspaces, wsId, (w) => {
    const order = leaves(w.layout)
    const index = order.findIndex((l) => l.id === leafId)
    if (index < 0) return w
    const layout = closeLeaf(w.layout, leafId)
    if (!layout) {
      const empty = makeLeaf()
      return { ...w, layout: empty, activeLeaf: empty.id }
    }
    if (w.activeLeaf !== leafId) return { ...w, layout }
    const neighbor = order[index - 1] ?? order[index + 1]
    return { ...w, layout, activeLeaf: neighbor.id }
  })
}

/** leafId 옆에 added를 두고 그쪽을 활성 영역으로 만든다. */
export function splitLeafIn(
  workspaces: Workspace[],
  wsId: string,
  leafId: string,
  dir: Split['dir'],
  added: Leaf
): Workspace[] {
  return patchWorkspace(workspaces, wsId, (w) => {
    const order = leaves(w.layout)
    if (!order.some((l) => l.id === leafId) || order.some((l) => l.id === added.id)) return w
    return { ...w, layout: splitLeaf(w.layout, leafId, dir, added), activeLeaf: added.id }
  })
}

export function nextWorkspaceName(workspaces: Workspace[]): string {
  const used = new Set(workspaces.map((w) => w.name))
  for (let n = workspaces.length + 1; ; n++) {
    const name = `작업 ${n}`
    if (!used.has(name)) return name
  }
}

export function newWorkspace(name: string): Workspace {
  const leaf = makeLeaf()
  return { id: newId(), name, layout: leaf, activeLeaf: leaf.id }
}

export function defaultSession(): FolderSession {
  const ws = newWorkspace('작업 1')
  return { workspaces: [ws], activeWorkspace: ws.id, expanded: [] }
}

/**
 * 저장돼 있던 세션을 검증해서 되살린다. 구조가 깨진 워크스페이스는 버리고,
 * 하나도 남지 않으면 기본값을 쓴다. 더 이상 없는 임시 메모를 가리키는 영역은 비운다.
 */
export function restoreSession(raw: unknown, scratchIds: ReadonlySet<string>): FolderSession {
  if (!raw || typeof raw !== 'object') return defaultSession()
  const r = raw as Record<string, unknown>
  const seenLeaves = new Set<string>()
  const seenWorkspaces = new Set<string>()
  const workspaces: Workspace[] = []
  for (const item of Array.isArray(r.workspaces) ? r.workspaces : []) {
    if (!item || typeof item !== 'object') continue
    const w = item as Record<string, unknown>
    if (typeof w.id !== 'string' || typeof w.name !== 'string' || !isValidLayout(w.layout)) continue
    if (seenWorkspaces.has(w.id)) continue
    const own = leaves(w.layout)
    const ids = new Set(own.map((l) => l.id))
    if (ids.size !== own.length || own.some((l) => seenLeaves.has(l.id))) continue
    own.forEach((l) => seenLeaves.add(l.id))
    seenWorkspaces.add(w.id)
    const layout = mapLeaves(w.layout, (leaf) =>
      (leaf.doc?.type === 'scratch' && !scratchIds.has(leaf.doc.id)) ||
      (leaf.doc?.type === 'file' && (!/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(leaf.doc.path) || leaf.doc.path.includes('\0')))
        ? { ...leaf, doc: null } : leaf
    )
    const activeLeaf = typeof w.activeLeaf === 'string' && ids.has(w.activeLeaf) ? w.activeLeaf : own[0].id
    workspaces.push({ id: w.id, name: w.name.trim() || '작업', layout, activeLeaf })
  }
  if (workspaces.length === 0) return defaultSession()
  const activeWorkspace =
    typeof r.activeWorkspace === 'string' && seenWorkspaces.has(r.activeWorkspace)
      ? r.activeWorkspace
      : workspaces[0].id
  const expanded = Array.isArray(r.expanded)
    ? [...new Set(r.expanded.filter((p): p is string => typeof p === 'string'))]
    : []
  return { workspaces, activeWorkspace, expanded }
}

/* ───────────── 스토어 ───────────── */

export interface AppStore {
  screen: 'loading' | 'start' | 'session'
  /** 열린 폴더. 세션 화면인데 null이면 "폴더 없는 세션". */
  folder: string | null
  recent: string[]
  scratches: ScratchMeta[]

  workspaces: Workspace[]
  activeWorkspace: string
  /** 한 번이라도 보여준 워크스페이스. 숨긴 채로 유지해 편집기 상태를 보존한다. */
  visited: string[]
  expanded: string[]
  /** 불러온 폴더의 내용. null은 읽지 못한 폴더. */
  tree: Record<string, DirEntry[] | null>

  sidebarOpen: boolean
  sidebarTab: 'files' | 'search'
  searchFocus: number

  docs: Record<string, DocInfo>
  modals: Modal[]
  toasts: Toast[]
  busy: number
  dropTarget: string | null
  reveal: Reveal | null

  enterSession(folder: string | null, session: FolderSession, root: DirEntry[] | null): void
  leaveSession(): void
  setWorkspaces(fn: (workspaces: Workspace[]) => Workspace[]): void
  activateLeaf(wsId: string, leafId: string): void
  switchWorkspace(id: string): void
  addWorkspace(): void
  renameWorkspace(id: string, name: string): void
  setLeafMode(wsId: string, leafId: string, mode: EditMode): void
  resizeSplit(wsId: string, splitId: string, sizes: number[]): void
  setExpanded(path: string, open: boolean): void
  setTree(dir: string, entries: DirEntry[] | null): void
  upsertScratch(meta: ScratchMeta, toFront?: boolean): void
  removeScratch(id: string): void
}

export const useStore = create<AppStore>()((set) => ({
  screen: 'loading',
  folder: null,
  recent: [],
  scratches: [],
  workspaces: [],
  activeWorkspace: '',
  visited: [],
  expanded: [],
  tree: {},
  sidebarOpen: true,
  sidebarTab: 'files',
  searchFocus: 0,
  docs: {},
  modals: [],
  toasts: [],
  busy: 0,
  dropTarget: null,
  reveal: null,

  enterSession: (folder, session, root) =>
    set({
      screen: 'session',
      folder,
      workspaces: session.workspaces,
      activeWorkspace: session.activeWorkspace,
      visited: [session.activeWorkspace],
      expanded: session.expanded,
      tree: folder ? { [folder]: root } : {},
      sidebarTab: 'files',
      dropTarget: null,
      reveal: null
    }),

  leaveSession: () =>
    set({
      screen: 'start',
      folder: null,
      workspaces: [],
      activeWorkspace: '',
      visited: [],
      expanded: [],
      tree: {},
      dropTarget: null,
      reveal: null
    }),

  setWorkspaces: (fn) =>
    set((s) => {
      const workspaces = fn(s.workspaces)
      return workspaces === s.workspaces ? s : { workspaces }
    }),

  activateLeaf: (wsId, leafId) =>
    set((s) => {
      const ws = s.workspaces.find((w) => w.id === wsId)
      if (!ws || ws.activeLeaf === leafId || !leaves(ws.layout).some((l) => l.id === leafId)) return s
      return { workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({ ...w, activeLeaf: leafId })) }
    }),

  switchWorkspace: (id) =>
    set((s) => {
      if (s.activeWorkspace === id || !s.workspaces.some((w) => w.id === id)) return s
      return { activeWorkspace: id, visited: s.visited.includes(id) ? s.visited : [...s.visited, id] }
    }),

  addWorkspace: () =>
    set((s) => {
      const ws = newWorkspace(nextWorkspaceName(s.workspaces))
      return { workspaces: [...s.workspaces, ws], activeWorkspace: ws.id, visited: [...s.visited, ws.id] }
    }),

  renameWorkspace: (id, name) =>
    set((s) => {
      const trimmed = name.trim()
      if (!trimmed) return s
      return { workspaces: patchWorkspace(s.workspaces, id, (w) => ({ ...w, name: trimmed })) }
    }),

  setLeafMode: (wsId, leafId, mode) =>
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({ ...w, layout: updateLeaf(w.layout, leafId, { mode }) }))
    })),

  resizeSplit: (wsId, splitId, sizes) =>
    set((s) => ({
      workspaces: patchWorkspace(s.workspaces, wsId, (w) => ({ ...w, layout: setSizes(w.layout, splitId, sizes) }))
    })),

  setExpanded: (path, open) =>
    set((s) => {
      const has = s.expanded.includes(path)
      if (has === open) return s
      return { expanded: open ? [...s.expanded, path] : s.expanded.filter((p) => p !== path) }
    }),

  setTree: (dir, entries) => set((s) => ({ tree: { ...s.tree, [dir]: entries } })),

  upsertScratch: (meta, toFront = false) =>
    set((s) => {
      const exists = s.scratches.some((m) => m.id === meta.id)
      if (!exists || toFront) return { scratches: [meta, ...s.scratches.filter((m) => m.id !== meta.id)] }
      return { scratches: s.scratches.map((m) => (m.id === meta.id ? meta : m)) }
    }),

  removeScratch: (id) => set((s) => ({ scratches: s.scratches.filter((m) => m.id !== id) }))
}))

/* ───────────── 스토어만 건드리는 공용 동작 ───────────── */

let serial = 0

export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++serial
  useStore.setState((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, text }] }))
  setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4000)
}

export function dismissToast(id: number): void {
  useStore.setState((s) => (s.toasts.some((t) => t.id === id) ? { toasts: s.toasts.filter((t) => t.id !== id) } : s))
}

function closeModal(id: number): void {
  useStore.setState((s) => ({ modals: s.modals.filter((m) => m.id !== id) }))
}

/** 앱 안 확인 창. 고른 버튼의 id, 취소(Esc·바깥 클릭)면 null. */
export function confirmModal(opts: {
  title: string
  message?: string
  details?: string[]
  buttons: ModalButton[]
}): Promise<string | null> {
  return new Promise((resolve) => {
    const id = ++serial
    const modal: ConfirmModal = {
      type: 'confirm',
      id,
      ...opts,
      resolve: (choice) => {
        closeModal(id)
        resolve(choice)
      }
    }
    useStore.setState((s) => ({ modals: [...s.modals, modal] }))
  })
}

/** 앱 안 입력 창. submit이 성공(null)하면 입력값, 취소면 null. */
export function promptModal(opts: {
  title: string
  label?: string
  initial: string
  selectEnd?: number
  okLabel?: string
  submit?: PromptModal['submit']
}): Promise<string | null> {
  return new Promise((resolve) => {
    const id = ++serial
    const modal: PromptModal = {
      type: 'prompt',
      id,
      title: opts.title,
      label: opts.label,
      initial: opts.initial,
      selectEnd: opts.selectEnd,
      okLabel: opts.okLabel,
      submit: opts.submit ?? (() => null),
      resolve: (value) => {
        closeModal(id)
        resolve(value)
      }
    }
    useStore.setState((s) => ({ modals: [...s.modals, modal] }))
  })
}

/** 파일 작업 동안 화면 입력을 잠깐 막는다(저장 마무리와 이름 변경 사이에 글자가 끼어들지 않게). */
export async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
  useStore.setState((s) => ({ busy: s.busy + 1 }))
  try {
    return await fn()
  } finally {
    useStore.setState((s) => ({ busy: Math.max(0, s.busy - 1) }))
  }
}

export function activeWorkspaceOf(s: AppStore): Workspace | null {
  return s.workspaces.find((w) => w.id === s.activeWorkspace) ?? null
}

export function activeLeafOf(s: AppStore): Leaf | null {
  const ws = activeWorkspaceOf(s)
  return ws ? (leaves(ws.layout).find((l) => l.id === ws.activeLeaf) ?? null) : null
}

export function titleOfRef(ref: DocRef, scratches: ScratchMeta[]): string {
  if (ref.type === 'file') return basename(ref.path)
  return scratches.find((m) => m.id === ref.id)?.title ?? '임시 메모'
}

export function titleOfKey(key: string, scratches: ScratchMeta[]): string {
  if (key.startsWith('file:')) return basename(key.slice(5))
  return titleOfRef({ type: 'scratch', id: key.slice(8) }, scratches)
}
