import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import { decodeText, encodeText } from './shared/text'
import type {
  AppState,
  CopyMode,
  DirEntry,
  DocKind,
  Eol,
  FolderSession,
  MenuCommand,
  OpResult,
  ReadResult,
  ScratchMeta,
  SearchResult,
  WriteResult
} from './shared/types'

/** Rust 쪽 명령을 감싼 얇은 층. 화면 코드는 이 파일만 통해 시스템에 접근한다. */

async function op<T>(cmd: string, args: Record<string, unknown>): Promise<OpResult<T>> {
  try {
    return { ok: true, value: await invoke<T>(cmd, args) }
  } catch (e) {
    return { ok: false, message: String(e) }
  }
}

export const isMac = navigator.userAgent.includes('Mac')

export const api = {
  resolvePath: (path: string) => invoke<{ path: string; isSymlink: boolean }>('resolve_path', { path }),
  loadAppState: () => invoke<AppState>('load_app_state'),
  setLast: (last: string | null) => invoke<void>('set_last', { last }),
  loadSession: (folder: string | null) => invoke<FolderSession | null>('load_session', { folder }),
  saveSession: (folder: string | null, session: FolderSession) =>
    invoke<void>('save_session', { folder, session }),

  async pickFolder(): Promise<string | null> {
    const picked = await open({ directory: true, multiple: false, title: '폴더 열기' })
    return typeof picked === 'string' ? picked : null
  },
  async pickFiles(): Promise<string[]> {
    const picked = await open({ multiple: true, title: '파일 열기' })
    if (!picked) return []
    return Array.isArray(picked) ? picked : [picked]
  },
  async pickSave(defaultPath: string, kind: DocKind): Promise<string | null> {
    const filters =
      kind === 'md'
        ? [
            { name: 'Markdown', extensions: ['md'] },
            { name: '텍스트', extensions: ['txt'] }
          ]
        : [
            { name: '텍스트', extensions: ['txt'] },
            { name: 'Markdown', extensions: ['md'] }
          ]
    return (await save({ defaultPath, filters, title: '저장' })) ?? null
  },

  readDir: (path: string) => op<DirEntry[]>('read_dir', { path }),

  async readFile(path: string): Promise<ReadResult> {
    try {
      const { raw, mtimeMs } = await invoke<{ raw: string; mtimeMs: number }>('read_file', { path })
      return { ok: true, data: { ...decodeText(raw), mtimeMs, raw } }
    } catch (e) {
      const code = String(e)
      if (code === 'missing' || code === 'not-text' || code === 'too-large') return { ok: false, reason: code }
      return { ok: false, reason: 'error', message: code.replace(/^error:/, '') }
    }
  },

  async writeFile(
    path: string,
    content: string,
    opts: { eol: Eol; bom: boolean } & ({ expectedMtimeMs: number; expectedRaw: string } | { expectedMtimeMs: null; expectedRaw?: null })
  ): Promise<WriteResult> {
    try {
      const mtimeMs = await invoke<number>('write_file', {
        path,
        raw: encodeText(content, opts.eol, opts.bom),
        expectedMtimeMs: opts.expectedMtimeMs,
        expectedRaw: opts.expectedRaw ?? null
      })
      return { ok: true, mtimeMs }
    } catch (e) {
      const code = String(e)
      if (code === 'conflict') return { ok: false, reason: 'conflict' }
      return { ok: false, reason: 'error', message: code.replace(/^error:/, '') }
    }
  },

  createFile: (path: string) => op<void>('create_file', { path }),
  createDir: (path: string) => op<void>('create_dir', { path }),
  rename: (from: string, to: string) => op<void>('rename_path', { from, to }),
  trash: (path: string) => op<void>('trash_path', { path }),
  existingNames: (sources: string[], destDir: string) =>
    invoke<string[]>('existing_names', { sources, destDir }),
  copyPath: (source: string, destDir: string, mode: CopyMode) =>
    op<string>('copy_path', { source, destDir, mode }),

  reveal: (path: string) => void revealItemInDir(path).catch(() => {}),
  openExternal(url: string): void {
    if (/^(https?:|mailto:)/i.test(url)) void openUrl(url).catch(() => {})
  },

  watchFolder: (path: string | null) => invoke<void>('watch_folder', { path }).catch(() => {}),
  watchFiles: (paths: string[]) => invoke<void>('watch_files', { paths }).catch(() => {}),
  onChanged: (cb: (paths: string[]) => void) => listen<string[]>('fs-changed', (e) => cb(e.payload)),

  scratchList: () => invoke<ScratchMeta[]>('scratch_list'),
  scratchRead: (id: string) => invoke<string | null>('scratch_read', { id }),
  scratchWrite: (meta: ScratchMeta, content: string) => invoke<void>('scratch_write', { meta, content }),
  scratchRemove: (id: string) => invoke<void>('scratch_remove', { id }),

  search: (folder: string, query: string) => invoke<SearchResult>('search', { folder, query }),

  onMenu: (cb: (cmd: MenuCommand) => void) => listen<MenuCommand>('menu', (e) => cb(e.payload)),

  /** 창을 닫으려 할 때. preventDefault()를 부르면 닫히지 않는다. */
  onCloseRequested: (cb: (event: { preventDefault(): void }) => void) =>
    getCurrentWindow().onCloseRequested((event) => cb(event)),
  /** 닫기 요청을 다시 거치지 않고 창을 닫는다. */
  closeWindow: () => getCurrentWindow().destroy(),

  /** OS에서 끌어온 파일. 좌표는 CSS 픽셀. */
  onDragDrop: (
    cb: (event: { type: 'over' | 'drop' | 'leave'; paths?: string[]; x?: number; y?: number }) => void
  ) =>
    getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === 'leave') return cb({ type: 'leave' })
      const scale = window.devicePixelRatio || 1
      cb({
        type: payload.type === 'drop' ? 'drop' : 'over',
        paths: payload.type === 'over' ? undefined : payload.paths,
        x: payload.position.x / scale,
        y: payload.position.y / scale
      })
    })
}
