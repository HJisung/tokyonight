export type DocKind = 'md' | 'txt'
export type EditMode = 'live' | 'source'
export type Eol = '\n' | '\r\n'

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface FileData {
  /** 읽은 바이트 그대로의 UTF-8 원문. 충돌 비교에 사용한다. */
  raw?: string
  content: string
  mtimeMs: number
  eol: Eol
  bom: boolean
}

export type ReadResult =
  | { ok: true; data: FileData }
  | { ok: false; reason: 'missing' | 'not-text' | 'too-large' | 'error'; message?: string }

export type WriteResult =
  | { ok: true; mtimeMs: number }
  | { ok: false; reason: 'conflict' | 'error'; message?: string }

export type OpResult<T = void> = { ok: true; value: T } | { ok: false; message: string }

export type DocRef = { type: 'file'; path: string } | { type: 'scratch'; id: string }

export interface Leaf {
  type: 'leaf'
  id: string
  doc: DocRef | null
  mode: EditMode
}

export interface Split {
  type: 'split'
  id: string
  dir: 'row' | 'column'
  sizes: number[]
  children: LayoutNode[]
}

export type LayoutNode = Leaf | Split

export interface Workspace {
  id: string
  name: string
  layout: LayoutNode
  activeLeaf: string
}

export interface FolderSession {
  workspaces: Workspace[]
  activeWorkspace: string
  expanded: string[]
}

export interface ScratchMeta {
  id: string
  kind: DocKind
  title: string
  updatedAt: number
}

export interface AppState {
  recent: string[]
  /** 마지막으로 열려 있던 세션. 폴더 경로, 폴더 없는 세션은 '', 시작 화면은 null. */
  last: string | null
}

export interface SearchResult {
  files: { path: string; name: string }[]
  matches: { path: string; line: number; text: string }[]
  truncated: boolean
}

export type MenuCommand =
  | 'new-scratch'
  | 'new-file'
  | 'open-folder'
  | 'open-file'
  | 'save'
  | 'close-folder'
  | 'split-right'
  | 'split-down'
  | 'close-pane'
  | 'toggle-mode'
  | 'new-workspace'
  | 'search'
  | 'insert-table'
  | 'undo'
  | 'redo'

export type CopyMode = 'fail' | 'overwrite' | 'keep-both'
