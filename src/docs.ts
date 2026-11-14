import { Text, type ChangeSet } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { api } from './api'
import { newId } from './shared/layout'
import { basename, isInside, rebase } from './shared/paths'
import { encodeText, kindOf, scratchTitle } from './shared/text'
import type { DocKind, DocRef, Eol, ReadResult, ScratchMeta } from './shared/types'
import { docKey, referencedKeys, retarget, toast, useStore, type DocInfo, type DocStatus } from './store'

/**
 * 열린 문서의 세션. 문서 하나에 세션 하나이고, 같은 문서를 보여주는 편집기 뷰들이 여기에 붙는다.
 *
 * 데이터 손실을 막는 규칙:
 * - 파일은 "마지막으로 본 수정 시각"과 함께 쓰고, 디스크가 달라졌으면 백엔드가 쓰지 않는다.
 * - 디스크와 내 내용이 모두 달라졌으면 충돌 상태로 두고 자동 저장을 멈춘다. 고르는 것은 사용자다.
 * - 저장은 문서마다 한 번에 하나만 돈다. 디스크 확인은 진행 중인 저장이 끝난 뒤에 한다.
 */

export const SAVE_DELAY_MS = 800

/** 세션이 편집기 뷰에 요구하는 것. 편집기 모듈을 직접 알지 않으려고 좁게 잡았다. */
export interface DocView {
  applyRemote(changes: ChangeSet): void
  replaceContent(content: string): void
  getDoc(): Text
}

interface Session {
  key: string
  ref: DocRef
  kind: DocKind
  status: DocStatus
  reason: string | null
  /** 현재 내용. 아직 불러오지 못했으면 null. */
  text: Text | null
  /** 디스크(또는 앱 데이터)에 마지막으로 저장된 내용 */
  saved: Text | null
  mtimeMs: number | null
  savedRaw: string | null
  eol: Eol
  bom: boolean
  /** 임시 메모의 종류처럼 내용 말고 저장할 것이 남았는지 */
  metaDirty: boolean
  views: Set<DocView>
  timer: ReturnType<typeof setTimeout> | null
  loading: Promise<void> | null
  saving: Promise<void> | null
  checking: boolean
  recheck: boolean
  /** 디스크 기준 상태가 바뀔 때마다 증가. 오래된 읽기 결과를 버리는 데 쓴다. */
  rev: number
  saveError: string | null
  dead: boolean
  releasing: boolean
  /** 사용자가 "변경을 버리고 닫기"를 고른 문서 */
  discardOk: boolean
}

const sessions = new Map<string, Session>()

/** 영역 id → 그 영역의 편집기 뷰. 메뉴 명령(표 삽입, 실행 취소 등)이 활성 뷰를 찾는 데 쓴다. */
export const leafViews = new Map<string, EditorView>()

const toText = (content: string): Text => Text.of(content.split('\n'))

function isDirty(s: Session): boolean {
  if (s.text === null) return false
  return s.metaDirty || s.saved === null || !s.text.eq(s.saved)
}

function publish(s: Session): void {
  if (s.dead) return
  const next: DocInfo = {
    key: s.key,
    kind: s.kind,
    status: s.status,
    hasText: s.text !== null,
    dirty: isDirty(s),
    saving: s.saving !== null,
    saveError: s.saveError,
    reason: s.reason
  }
  const cur = useStore.getState().docs[s.key]
  if (cur && (Object.keys(next) as (keyof DocInfo)[]).every((k) => cur[k] === next[k])) return
  useStore.setState((st) => ({ docs: { ...st.docs, [s.key]: next } }))
}

function unpublish(key: string): void {
  useStore.setState((st) => {
    if (!(key in st.docs)) return st
    const docs = { ...st.docs }
    delete docs[key]
    return { docs }
  })
}

function stopTimer(s: Session): void {
  if (s.timer) clearTimeout(s.timer)
  s.timer = null
}

function schedule(s: Session): void {
  stopTimer(s)
  // 충돌·사라짐 상태에서는 자동 저장을 하지 않는다.
  if (s.dead || s.discardOk || s.status !== 'ready') return
  s.timer = setTimeout(() => {
    s.timer = null
    void save(s)
  }, SAVE_DELAY_MS)
}

function readReason(res: Extract<ReadResult, { ok: false }>): string {
  if (res.reason === 'not-text') return '텍스트(UTF-8) 파일이 아니어서 열 수 없습니다.'
  if (res.reason === 'too-large') return '파일이 너무 커서 열 수 없습니다(20MB 초과).'
  if (res.reason === 'missing') return '파일을 찾을 수 없습니다.'
  return `파일을 읽지 못했습니다: ${res.message ?? '알 수 없는 오류'}`
}

function pushContent(s: Session, content: string): void {
  for (const view of s.views) {
    try {
      view.replaceContent(content)
    } catch (e) {
      console.error('편집기에 내용을 반영하지 못했습니다', e)
    }
  }
}

/**
 * 방금 읽은 디스크 상태를 세션에 반영한다(동기). 호출 시점의 현재 내용으로 판단하므로
 * 읽는 동안 입력된 글자도 "내 변경"으로 취급된다.
 */
function applyDisk(s: Session, res: ReadResult): void {
  s.rev++
  if (!res.ok) {
    if (res.reason === 'missing') {
      s.status = 'missing'
      s.reason = null
    } else if (s.text === null) {
      s.status = 'error'
      s.reason = readReason(res)
    } else {
      // 내용을 갖고 있는데 디스크의 파일을 읽을 수 없게 됐다. 덮어쓰지 않도록 충돌로 둔다.
      s.status = 'conflict'
      s.reason = readReason(res)
    }
    stopTimer(s)
    publish(s)
    return
  }
  const d = res.data
  const disk = toText(d.content)
  const adoptMeta = () => {
    s.mtimeMs = d.mtimeMs
    s.savedRaw = d.raw ?? encodeText(d.content, d.eol, d.bom)
    s.eol = d.eol
    s.bom = d.bom
  }
  if (s.text === null || !isDirty(s)) {
    // 내 변경이 없으면 디스크 내용을 조용히 받아들인다.
    const changed = s.text === null || !disk.eq(s.text)
    if (changed) {
      s.text = disk
      s.saved = disk
      pushContent(s, d.content)
    }
    adoptMeta()
    s.status = 'ready'
  } else if (disk.eq(s.text)) {
    s.saved = s.text
    adoptMeta()
    s.status = 'ready'
  } else if (s.saved !== null && disk.eq(s.saved)) {
    // 수정 시각만 바뀌었다. 내 변경은 그대로 저장 대상이다.
    adoptMeta()
    s.status = 'ready'
  } else {
    s.status = 'conflict'
    s.reason = null
    stopTimer(s)
    publish(s)
    return
  }
  s.reason = null
  s.saveError = null
  if (isDirty(s)) schedule(s)
  publish(s)
}

function load(s: Session): Promise<void> {
  if (s.loading) return s.loading
  s.status = 'loading'
  s.reason = null
  const run = (async () => {
    if (s.ref.type === 'file') {
      const res = await api.readFile(s.ref.path)
      if (!s.dead) applyDisk(s, res)
      return
    }
    let content: string | null
    try {
      content = await api.scratchRead(s.ref.id)
    } catch (e) {
      if (s.dead) return
      s.status = 'error'
      s.reason = `임시 메모를 읽지 못했습니다: ${String(e)}`
      return
    }
    if (s.dead) return
    if (content === null) {
      s.status = 'missing'
      return
    }
    const normalized = content.replace(/\r\n?/g, '\n')
    s.text = toText(normalized)
    s.saved = s.text
    s.status = 'ready'
  })().finally(() => {
    s.loading = null
    publish(s)
  })
  s.loading = run
  publish(s)
  return run
}

async function writeFileDoc(s: Session, path: string, text: Text): Promise<void> {
  if (s.mtimeMs === null || s.savedRaw === null) throw new Error('저장 기준 원문이 없습니다.')
  const res = await api.writeFile(path, text.toString(), { eol: s.eol, bom: s.bom, expectedMtimeMs: s.mtimeMs, expectedRaw: s.savedRaw })
  if (s.dead) return
  if (res.ok) {
    s.saved = text
    s.savedRaw = encodeText(text.toString(), s.eol, s.bom)
    s.mtimeMs = res.mtimeMs
    s.saveError = null
    s.rev++
    return
  }
  if (res.reason === 'conflict') {
    // 디스크가 내가 본 것과 다르다. 아무것도 쓰지 않았다. 실제로 무엇이 달라졌는지 확인한다.
    const disk = await api.readFile(path)
    if (!s.dead && s.ref.type === 'file' && s.ref.path === path) applyDisk(s, disk)
    return
  }
  s.saveError = res.message ?? '알 수 없는 오류'
}

async function writeScratchDoc(s: Session, id: string, text: Text): Promise<void> {
  const content = text.toString()
  const meta: ScratchMeta = { id, kind: s.kind, title: scratchTitle(content), updatedAt: Date.now() }
  try {
    await api.scratchWrite(meta, content)
  } catch (e) {
    if (!s.dead) s.saveError = String(e)
    return
  }
  if (s.dead) return
  s.saved = text
  s.metaDirty = s.kind !== meta.kind
  s.saveError = null
  useStore.getState().upsertScratch(meta)
}

/** 변경이 있으면 지금 저장한다. 같은 문서의 저장은 차례로만 돈다. */
async function save(s: Session): Promise<void> {
  stopTimer(s)
  while (s.saving) await s.saving
  if (s.dead || s.status !== 'ready' || s.text === null || !isDirty(s)) return
  const text = s.text
  const work = s.ref.type === 'file' ? writeFileDoc(s, s.ref.path, text) : writeScratchDoc(s, s.ref.id, text)
  const run: Promise<void> = work
    .catch((e) => {
      if (!s.dead) s.saveError = String(e)
    })
    .finally(() => {
      if (s.saving === run) s.saving = null
      // 저장하는 동안 더 입력했으면 다시 예약한다. 저장에 실패했으면 다음 입력이나 재시도를 기다린다.
      if (!s.dead && !s.saveError && isDirty(s)) schedule(s)
      publish(s)
    })
  s.saving = run
  publish(s)
  await run
}

async function check(s: Session): Promise<void> {
  if (s.dead || s.ref.type !== 'file') return
  if (s.checking) {
    s.recheck = true
    return
  }
  s.checking = true
  try {
    for (;;) {
      s.recheck = false
      while (s.loading || s.saving) await (s.loading ?? s.saving)
      if (s.dead || s.ref.type !== 'file') return
      const rev = s.rev
      const path = s.ref.path
      const res = await api.readFile(path)
      if (s.dead) return
      // 읽는 사이에 내가 저장했거나 경로가 바뀌었으면 이 결과는 낡았다.
      if (s.saving || s.loading || s.rev !== rev || s.ref.type !== 'file' || s.ref.path !== path) continue
      applyDisk(s, res)
      if (!s.recheck) return
    }
  } finally {
    s.checking = false
  }
}

function kill(s: Session): void {
  s.dead = true
  stopTimer(s)
  if (sessions.get(s.key) === s) sessions.delete(s.key)
  unpublish(s.key)
}

/* ───────────── 공개 함수 ───────────── */

/** 문서를 연다. 이미 열려 있으면 그 세션을 그대로 쓴다. */
export function open(ref: DocRef): void {
  const key = docKey(ref)
  if (sessions.has(key)) return
  let kind: DocKind
  if (ref.type === 'file') kind = kindOf(basename(ref.path))
  else kind = useStore.getState().scratches.find((m) => m.id === ref.id)?.kind ?? 'txt'
  const s: Session = {
    key,
    ref,
    kind,
    status: 'loading',
    reason: null,
    text: null,
    saved: null,
    mtimeMs: null,
    savedRaw: null,
    eol: '\n',
    bom: false,
    metaDirty: false,
    views: new Set(),
    timer: null,
    loading: null,
    saving: null,
    checking: false,
    recheck: false,
    rev: 0,
    saveError: null,
    dead: false,
    releasing: false,
    discardOk: false
  }
  sessions.set(key, s)
  void load(s)
}

export const has = (key: string): boolean => sessions.has(key)
export const openKeys = (): string[] => [...sessions.keys()]
export const textOf = (key: string): Text | null => sessions.get(key)?.text ?? null
export const contentOf = (key: string): string | null => sessions.get(key)?.text?.toString() ?? null
export const kindOfDoc = (key: string): DocKind | null => sessions.get(key)?.kind ?? null
export function formatOf(key: string): { eol: Eol; bom: boolean } | null {
  const s = sessions.get(key)
  return s ? { eol: s.eol, bom: s.bom } : null
}

export function attach(key: string, view: DocView): void {
  sessions.get(key)?.views.add(view)
}

export function detach(key: string, view: DocView): void {
  sessions.get(key)?.views.delete(view)
}

/** 한 뷰에서 사용자가 만든 변경을 세션과 나머지 뷰에 반영하고 자동 저장을 예약한다. */
export function localChange(key: string, source: DocView, changes: ChangeSet): void {
  const s = sessions.get(key)
  if (!s || s.text === null) return
  // 정상이라면 길이가 항상 맞는다. 어긋났다면 입력이 일어난 뷰의 내용을 기준으로 삼는다.
  const inSync = changes.length === s.text.length
  s.text = inSync ? changes.apply(s.text) : source.getDoc()
  s.discardOk = false
  for (const view of s.views) {
    if (view === source) continue
    try {
      if (!inSync) throw new Error('out of sync')
      view.applyRemote(changes)
    } catch {
      try {
        view.replaceContent(s.text.toString())
      } catch (e) {
        console.error('편집기에 내용을 반영하지 못했습니다', e)
      }
    }
  }
  schedule(s)
  publish(s)
}

/** 대기 중인 저장을 지금 끝낸다. 저장할 것이 남지 않았으면 true. */
export async function flush(key: string): Promise<boolean> {
  const s = sessions.get(key)
  if (!s) return true
  if (s.loading) await s.loading
  for (let i = 0; i < 3; i++) {
    await save(s)
    if (s.dead || !isDirty(s) || s.status !== 'ready' || s.saveError) break
  }
  return s.dead || !isDirty(s)
}

async function flushMany(keys: string[]): Promise<string[]> {
  const results = await Promise.all(keys.map(async (key) => ((await flush(key)) ? null : key)))
  return results.filter((k): k is string => k !== null)
}

function keysUnder(path: string): string[] {
  return [...sessions.values()]
    .filter((s) => s.ref.type === 'file' && isInside(s.ref.path, path))
    .map((s) => s.key)
}

/** 저장을 끝내고, 그래도 저장되지 않은 변경이 남은 문서의 키를 돌려준다. */
export const flushAll = (): Promise<string[]> => flushMany([...sessions.keys()])
export const flushUnder = (path: string): Promise<string[]> => flushMany(keysUnder(path))

export function checkDisk(key: string): Promise<void> {
  const s = sessions.get(key)
  return s ? check(s) : Promise.resolve()
}

export function checkAll(): void {
  for (const s of sessions.values()) void check(s)
}

const nfc = (p: string) => p.normalize('NFC')

/** 변경 알림에 들어온 경로(파일 또는 상위 폴더)에 해당하는 열린 파일을 확인한다. */
export function checkPaths(paths: string[]): void {
  const changed = paths.map(nfc)
  for (const s of sessions.values()) {
    if (s.ref.type !== 'file') continue
    const mine = nfc(s.ref.path)
    if (changed.some((p) => isInside(mine, p))) void check(s)
  }
}

/** 충돌 해결: 디스크 내용을 불러오고 내 변경은 버린다. */
export async function reloadFromDisk(key: string): Promise<boolean> {
  const s = sessions.get(key)
  if (!s || s.ref.type !== 'file') return false
  stopTimer(s)
  while (s.saving) await s.saving
  const path = s.ref.path
  const text = s.text
  const rev = s.rev
  const res = await api.readFile(path)
  if (s.dead || s.ref.type !== 'file' || s.ref.path !== path) return false
  if (s.text !== text || s.rev !== rev || s.saving) {
    toast('불러오는 동안 문서가 바뀌어 새 입력을 유지했습니다. 다시 확인해 주세요.')
    return false
  }
  if (!res.ok) {
    toast(readReason(res), 'error')
    return false
  }
  // 사용자가 고른 것이므로 내 변경이 없는 것으로 보고 받아들인다.
  if (s.text !== null) s.saved = s.text
  applyDisk(s, res)
  return true
}

/** 충돌·사라짐 해결: 디스크 상태와 상관없이 내 내용으로 쓴다. 사용자가 고른 경우에만 부른다. */
export async function overwriteDisk(key: string): Promise<boolean> {
  const s = sessions.get(key)
  if (!s || s.ref.type !== 'file' || s.text === null) return false
  stopTimer(s)
  while (s.saving) await s.saving
  if (s.dead || s.ref.type !== 'file') return false
  const path = s.ref.path
  const text = s.text
  let ok = false
  const run: Promise<void> = (async () => {
    const res = await api.writeFile(path, text.toString(), { eol: s.eol, bom: s.bom, expectedMtimeMs: null })
    if (s.dead) return
    if (!res.ok) {
      s.saveError = res.message ?? '알 수 없는 오류'
      return
    }
    ok = true
    s.saved = text
    s.savedRaw = encodeText(text.toString(), s.eol, s.bom)
    s.mtimeMs = res.mtimeMs
    s.status = 'ready'
    s.reason = null
    s.saveError = null
    s.rev++
  })()
    .catch((e) => {
      if (!s.dead) s.saveError = String(e)
    })
    .finally(() => {
      if (s.saving === run) s.saving = null
      if (!s.dead && !s.saveError && isDirty(s)) schedule(s)
      publish(s)
    })
  s.saving = run
  publish(s)
  await run
  return ok
}

/** 불러오지 못한 문서를 다시 불러온다. */
export function retryLoad(key: string): void {
  const s = sessions.get(key)
  if (s && s.text === null) void load(s)
  else if (s) void check(s)
}

export function retrySave(key: string): void {
  const s = sessions.get(key)
  if (!s) return
  s.saveError = null
  publish(s)
  void save(s)
}

/** 임시 메모의 종류(TXT↔MD)를 바꾸고 바로 저장한다. */
export function setScratchKind(key: string, kind: DocKind): void {
  const s = sessions.get(key)
  if (!s || s.ref.type !== 'scratch' || s.kind === kind) return
  s.kind = kind
  s.metaDirty = true
  publish(s)
  void save(s)
}

/**
 * 파일·폴더 이름이 바뀐 뒤 열린 문서와 화면의 참조를 새 경로로 옮긴다.
 * 부르기 전에 flushUnder로 저장을 끝내야 한다(남은 변경은 세션과 함께 새 경로로 따라간다).
 */
export function movePaths(from: string, to: string): void {
  const skipped = new Set<string>()
  const docsPatch: Record<string, DocInfo | undefined> = {}
  for (const s of [...sessions.values()]) {
    if (s.ref.type !== 'file' || !isInside(s.ref.path, from)) continue
    const path = rebase(s.ref.path, from, to)
    const key = docKey({ type: 'file', path })
    if (key === s.key) continue
    if (sessions.has(key)) {
      // 새 경로에 이미 세션이 있다(사라졌던 파일 등). 합치지 않고 각자 디스크를 확인하게 둔다.
      skipped.add(s.key)
      continue
    }
    stopTimer(s)
    sessions.delete(s.key)
    docsPatch[s.key] = undefined
    s.key = key
    s.ref = { type: 'file', path }
    s.kind = kindOf(basename(path))
    s.rev++
    sessions.set(key, s)
  }
  useStore.setState((st) => {
    const docs = { ...st.docs }
    for (const key of Object.keys(docsPatch)) delete docs[key]
    const tree: typeof st.tree = {}
    for (const [dir, entries] of Object.entries(st.tree)) if (!isInside(dir, from)) tree[dir] = entries
    return {
      docs,
      tree,
      expanded: st.expanded.map((p) => rebase(p, from, to)),
      workspaces: retarget(st.workspaces, (ref) => {
        if (ref.type !== 'file' || !isInside(ref.path, from) || skipped.has(docKey(ref))) return ref
        return { type: 'file', path: rebase(ref.path, from, to) }
      })
    }
  })
  for (const s of sessions.values()) {
    if (s.ref.type !== 'file') continue
    if (isInside(s.ref.path, to)) {
      publish(s)
      if (isDirty(s)) schedule(s)
    }
    if (isInside(s.ref.path, to) || skipped.has(s.key)) void check(s)
  }
}

/** 세션을 저장하지 않고 없앤다. 진행 중이던 저장이 끝나면 resolve한다. */
export function discard(key: string): Promise<void> {
  const s = sessions.get(key)
  if (!s) return Promise.resolve()
  const pending = s.saving
  kill(s)
  return pending ? pending.catch(() => {}) : Promise.resolve()
}

export function discardUnder(path: string): Promise<void> {
  return Promise.all(keysUnder(path).map(discard)).then(() => {})
}

export function discardAll(): Promise<void> {
  return Promise.all([...sessions.keys()].map(discard)).then(() => {})
}

/** 사용자가 이 문서의 저장되지 않은 변경을 버리기로 했다. */
export function allowDiscard(key: string): void {
  const s = sessions.get(key)
  if (s) { s.discardOk = true; stopTimer(s) }
}

/** 묻지 않고 닫히게 된 문서의 저장되지 않은 내용을 임시 메모로 남긴다. */
async function rescue(s: Session): Promise<boolean> {
  if (s.text === null) return true
  const name = s.ref.type === 'file' ? basename(s.ref.path) : '임시 메모'
  const meta: ScratchMeta = { id: newId(), kind: s.kind, title: `복구: ${name}`, updatedAt: Date.now() }
  try {
    await api.scratchWrite(meta, s.text.toString())
  } catch (e) {
    toast(`"${name}"의 저장되지 않은 내용을 보관하지 못했습니다: ${String(e)}`, 'error')
    return false
  }
  useStore.getState().upsertScratch(meta, true)
  toast(`"${name}"의 저장되지 않은 내용을 임시 메모로 보관했습니다.`)
  return true
}

async function release(s: Session): Promise<void> {
  s.releasing = true
  try {
    if (!s.discardOk) await flush(s.key)
    else while (s.saving) await s.saving
    if (s.dead) return
    if (referencedKeys(useStore.getState().workspaces).has(s.key)) return
    if (isDirty(s) && !s.discardOk && !(await rescue(s))) return
    if (referencedKeys(useStore.getState().workspaces).has(s.key)) return
    kill(s)
  } finally {
    s.releasing = false
  }
}

/** 어떤 영역도 보여주지 않는 문서를 저장한 뒤 정리한다. */
export async function collect(): Promise<void> {
  const refs = referencedKeys(useStore.getState().workspaces)
  const idle = [...sessions.values()].filter((s) => !refs.has(s.key) && !s.releasing)
  await Promise.all(idle.map(release))
}

let collectTimer: ReturnType<typeof setTimeout> | null = null

/** 화면에서 문서가 빠질 때마다 정리를 예약한다. 구독 해제 함수를 돌려준다. */
export function startDocSync(): () => void {
  return useStore.subscribe((st, prev) => {
    if (st.workspaces === prev.workspaces || collectTimer) return
    collectTimer = setTimeout(() => {
      collectTimer = null
      void collect()
    }, 0)
  })
}

/** 테스트용: 모든 세션을 지운다. */
export function resetForTest(): void {
  for (const s of [...sessions.values()]) kill(s)
  leafViews.clear()
}
