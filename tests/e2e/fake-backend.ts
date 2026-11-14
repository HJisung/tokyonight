import type { AppState, FolderSession, ScratchMeta, SearchResult } from '../../src/shared/types'

export const ROOT = '/Users/test/Notes'
export const GUIDE = `${ROOT}/시작하기.md`
export const MARKDOWN = `# 나만의 작업실

생각을 정리하는 **작고 조용한 공간**입니다.
[프로젝트 안내](https://example.com/guide)에서 더 알아보세요.

## 오늘의 할 일

- [ ] 아이디어를 기록하기
- [x] 작업 공간 정리하기

> 좋은 생각은 언제나 한 줄의 메모에서 시작됩니다.

\`\`\`typescript
const greeting = '안녕하세요';
console.log(greeting);
\`\`\`

| 항목 | 상태 |
| --- | --- |
| 디자인 | 검토 중 |
| 개발 | 진행 중 |

참고한 자료[^note]를 여기에 남깁니다.

[^note]: 오래 간직하고 싶은 아이디어의 출처.

`;

type Node = { type: 'dir' } | { type: 'file'; raw: string; mtimeMs: number; invalidUtf8?: boolean; readError?: string; writeError?: string }
type Call = { command: string; args: Record<string, unknown>; result?: unknown; error?: string }
const clone = <T>(value: T): T => structuredClone(value)
const parent = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/'
const name = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const within = (path: string, dir: string) => path === dir || path.startsWith(dir === '/' ? '/' : dir + '/')
const supported = (path: string) => /\.(md|markdown|txt)$/i.test(name(path)) || !name(path).includes('.')

/** 실제 files.rs/store.rs/search.rs의 의미를 재현한다. 호스트 파일시스템에 접근하지 않는다.
 * 심볼릭 링크, OS 권한/휴지통/원자적 rename의 물리적 보장은 이 더블의 검증 범위 밖이다.
 */
export class FakeBackend {
  nodes = new Map<string, Node>()
  app: AppState = { recent: [ROOT], last: null }
  sessions = new Map<string, FolderSession>()
  scratches = new Map<string, { meta: ScratchMeta; content: string }>()
  calls: Call[] = []
  dialogs: (string | string[] | null)[] = []
  opened: string[] = []
  revealed: string[] = []
  watchedFolder: string | null = null
  watchedFiles: string[] = []
  destroyed = false
  clock = 1000
  failures = new Map<string, string>()

  constructor() {
    for (const p of ['/', '/Users', '/Users/test', ROOT, `${ROOT}/프로젝트`, '/External']) this.nodes.set(p, { type: 'dir' })
    this.put(GUIDE, MARKDOWN)
    this.put(`${ROOT}/회의.txt`, '주간 회의\n\n이번 주 목표를 정리합니다.\n검색용 바늘 문장입니다.\n')
    this.put(`${ROOT}/프로젝트/계획.md`, '# 다음 프로젝트\n\n새로운 아이디어를 담아 보세요.\n')
    this.put(`${ROOT}/.숨김.md`, '숨김')
    this.put(`${ROOT}/image.png`, '\0binary')
    this.put('/External/외부 메모.txt', '복사할 외부 문서')
  }

  put(path: string, raw: string) { this.nodes.set(path, { type: 'file', raw, mtimeMs: ++this.clock }) }
  text(path: string): string { const node = this.nodes.get(path); if (node?.type !== 'file') throw new Error(`파일 없음: ${path}`); return node.raw }
  private directory(path: string) { if (this.nodes.get(path)?.type !== 'dir') throw 'No such directory' }
  private remove(path: string) { for (const key of this.nodes.keys()) if (within(key, path)) this.nodes.delete(key) }
  private scratchId(id: string) { if (!/^[a-zA-Z0-9]{1,64}$/.test(id)) throw '잘못된 임시 메모 ID' }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const call: Call = { command, args: clone(args) }
    this.calls.push(call)
    try {
      if (this.failures.has(command)) throw this.failures.get(command)
      call.result = clone(this.execute(command, args))
      return clone(call.result)
    } catch (e) { call.error = String(e); throw String(e) }
  }

  private execute(command: string, a: Record<string, unknown>): unknown {
    const path = a.path as string
    switch (command) {
      case 'resolve_path': {
        const parts: string[] = []
        for (const part of path.split('/')) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part) }
        return { path: '/' + parts.join('/'), isSymlink: false }
      }
      case 'load_app_state': return this.app
      case 'set_last': {
        this.app.last = a.last as string | null
        if (this.app.last) this.app.recent = [this.app.last, ...this.app.recent.filter((v) => v !== this.app.last)].slice(0, 12)
        return null
      }
      case 'load_session': return this.sessions.get((a.folder as string | null) ?? '') ?? null
      case 'save_session': this.sessions.set((a.folder as string | null) ?? '', clone(a.session as FolderSession)); return null
      case 'read_dir': {
        this.directory(path)
        return [...this.nodes].filter(([p]) => p !== path && parent(p) === path && !name(p).startsWith('.'))
          .map(([p, n]) => ({ name: name(p), path: p, isDir: n.type === 'dir' }))
          .sort((x, y) => Number(y.isDir) - Number(x.isDir) || x.name.toLowerCase().localeCompare(y.name.toLowerCase()))
      }
      case 'read_file': {
        const n = this.nodes.get(path)
        if (!n) throw 'missing'
        if (n.type === 'dir') throw 'not-text'
        if (n.readError) throw `error:${n.readError}`
        if (new TextEncoder().encode(n.raw).length > 20 * 1024 * 1024) throw 'too-large'
        if (n.invalidUtf8 || n.raw.includes('\0')) throw 'not-text'
        return { raw: n.raw, mtimeMs: n.mtimeMs }
      }
      case 'write_file': {
        const node = this.nodes.get(path)
        if (a.expectedMtimeMs != null && (node?.type !== 'file' || node.mtimeMs !== a.expectedMtimeMs)) throw 'conflict'
        if (a.expectedRaw != null && (node?.type !== 'file' || node.raw !== a.expectedRaw)) throw 'conflict'
        this.directory(parent(path))
        if (node?.type === 'dir') throw 'error:Is a directory'
        if (node?.writeError) throw `error:${node.writeError}`
        this.put(path, a.raw as string)
        return this.clock
      }
      case 'create_file': case 'create_dir': {
        if (this.nodes.has(path)) throw '같은 이름의 항목이 이미 있습니다.'
        this.directory(parent(path))
        if (command === 'create_dir') this.nodes.set(path, { type: 'dir' }); else this.put(path, '')
        return null
      }
      case 'rename_path': {
        const from = a.from as string, to = a.to as string
        if (!this.nodes.has(from)) throw 'No such file or directory'
        if (to !== from && this.nodes.has(to)) throw '같은 이름의 항목이 이미 있습니다.'
        if (to === from) return null
        this.directory(parent(to))
        if (within(to, from)) throw 'Invalid argument'
        const affected = [...this.nodes].filter(([p]) => within(p, from))
        this.remove(from)
        for (const [p, n] of affected) this.nodes.set(to + p.slice(from.length), n)
        return null
      }
      case 'trash_path': if (!this.nodes.has(path)) throw 'No such file or directory'; this.remove(path); return null
      case 'existing_names': return (a.sources as string[]).map(name).filter((n) => this.nodes.has(`${a.destDir}/${n}`))
      case 'copy_path': {
        const source = a.source as string, dest = a.destDir as string
        if (!this.nodes.has(source)) throw 'No such file or directory'
        this.directory(dest)
        if (within(dest, source)) throw '폴더를 자기 자신 안으로 복사할 수 없습니다.'
        let target = `${dest}/${name(source)}`
        if (this.nodes.has(target)) {
          if (a.mode === 'overwrite') { if (target === source) throw '원본과 대상이 같은 항목입니다.' }
          else if (a.mode === 'keep-both') {
            const base = name(source), dot = base.lastIndexOf('.')
            for (let i = 2; this.nodes.has(target); i++) target = `${dest}/${dot > 0 ? base.slice(0, dot) + ' ' + i + base.slice(dot) : base + ' ' + i}`
          } else throw '같은 이름의 항목이 이미 있습니다.'
        }
        // Rust copy_recursive는 폴더를 합친다. 다른 종류가 겹치면 오류다.
        for (const [p, n] of [...this.nodes].filter(([p]) => within(p, source))) {
          const out = target + p.slice(source.length), existing = this.nodes.get(out)
          if (existing && existing.type !== n.type) throw 'File exists'
          if (n.type === 'dir') this.nodes.set(out, { type: 'dir' }); else this.put(out, n.raw)
        }
        return target
      }
      case 'scratch_list': return [...this.scratches.values()].map((v) => v.meta)
      case 'scratch_read': this.scratchId(a.id as string); return this.scratches.get(a.id as string)?.content ?? null
      case 'scratch_write': {
        const meta = a.meta as ScratchMeta
        this.scratchId(meta.id)
        this.scratches = new Map([[meta.id, { meta: clone(meta), content: a.content as string }], ...[...this.scratches].filter(([id]) => id !== meta.id)])
        return null
      }
      case 'scratch_remove': this.scratchId(a.id as string); this.scratches.delete(a.id as string); return null
      case 'watch_folder': this.watchedFolder = path; return null
      case 'watch_files': this.watchedFiles = a.paths as string[]; return null
      case 'search': return this.search(a.folder as string, a.query as string)
      case 'plugin:dialog|open': case 'plugin:dialog|save': return this.dialogs.shift() ?? null
      case 'plugin:dialog|message': throw 'Unexpected native message dialog: use an app modal'
      case 'plugin:opener|open_url': this.opened.push(a.url as string); return null
      case 'plugin:opener|reveal_item_in_dir': this.revealed.push(...(a.paths as string[])); return null
      case 'plugin:window|destroy': this.destroyed = true; return null
      case 'plugin:window|start_dragging': return null
      default: throw `Unhandled mock command: ${command}`
    }
  }

  private search(folder: string, query: string): SearchResult {
    const result: SearchResult = { files: [], matches: [], truncated: false }
    const q = query.trim().toLowerCase()
    if (!q) return result
    const stack = [folder]
    let seen = 0
    while (stack.length) {
      const dir = stack.pop()!
      for (const [path, n] of [...this.nodes].filter(([p]) => parent(p) === dir && p !== dir).sort(([a], [b]) => a.localeCompare(b))) {
        if (name(path).startsWith('.') || name(path) === 'node_modules') continue
        if (++seen > 30_000) { result.truncated = true; return result }
        if (n.type === 'dir') { stack.push(path); continue }
        if (!supported(path)) continue
        if (name(path).toLowerCase().includes(q)) {
          if (result.files.length < 50) result.files.push({ path, name: name(path) }); else result.truncated = true
        }
        if (result.matches.length >= 300) { result.truncated = true; continue }
        if (n.invalidUtf8 || n.readError || new TextEncoder().encode(n.raw).length > 2 * 1024 * 1024) continue
        let count = 0
        const lines = n.raw.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].toLowerCase().includes(q)) continue
          if (count >= 20 || result.matches.length >= 300) { result.truncated = true; break }
          count++
          const line = lines[i].trim(), chars = [...line], at = [...line.slice(0, line.toLowerCase().indexOf(q))].length
          const start = Math.max(0, at - 40), end = Math.min(chars.length, start + 160)
          result.matches.push({ path, line: i + 1, text: chars.length <= 160 ? line : (start ? '…' : '') + chars.slice(start, end).join('') + (end < chars.length ? '…' : '') })
        }
      }
    }
    return result
  }
}
