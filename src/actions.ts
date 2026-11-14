import { api } from './api'
import * as docs from './docs'
import { insertTable, runRedo, runUndo } from './editor'
import { makeLeaf, newId } from './shared/layout'
import { basename, dirname, invalidName, isInside, join } from './shared/paths'
import { encodeText, isSupported } from './shared/text'
import type { DirEntry, DocKind, DocRef, FolderSession, MenuCommand, Split, Workspace } from './shared/types'
import {
  activeLeafOf, activeWorkspaceOf, allLeaves, closeLeafIn, confirmModal, docKey,
  promptModal, referencedKeys, restoreSession, retarget, setLeafDoc, splitLeafIn,
  titleOfKey, toast, useStore, withBusy
} from './store'

const SESSION_DELAY = 300
let persistenceTimer: ReturnType<typeof setTimeout> | null = null
let pendingSession: { folder: string | null; session: FolderSession } | null = null
let persistenceQueue = Promise.resolve()
let persistenceError: unknown = null

function snapshot(): { folder: string | null; session: FolderSession } | null {
  const s = useStore.getState()
  return s.screen === 'session' ? { folder: s.folder, session: {
    workspaces: s.workspaces, activeWorkspace: s.activeWorkspace, expanded: s.expanded
  } } : null
}

function enqueueSession(): void {
  if (!pendingSession) return
  const next = pendingSession
  pendingSession = null
  persistenceQueue = persistenceQueue.then(async () => {
    try {
      await api.saveSession(next.folder, next.session)
      persistenceError = null
    } catch (e) {
      persistenceError = e
      // 최신 화면은 다음 flush에서 다시 저장한다.
      toast(`작업 화면을 저장하지 못했습니다: ${String(e)}`, 'error')
    }
  })
}

export async function flushSession(): Promise<boolean> {
  if (persistenceTimer) clearTimeout(persistenceTimer)
  persistenceTimer = null
  pendingSession = snapshot() ?? pendingSession
  enqueueSession()
  await persistenceQueue
  return persistenceError === null
}

export function startSessionPersistence(): () => void {
  const unsubscribe = useStore.subscribe((s, p) => {
    if (s.screen !== 'session') return
    if (s.workspaces === p.workspaces && s.activeWorkspace === p.activeWorkspace && s.expanded === p.expanded) return
    pendingSession = snapshot()
    if (persistenceTimer) clearTimeout(persistenceTimer)
    persistenceTimer = setTimeout(() => { persistenceTimer = null; enqueueSession() }, SESSION_DELAY)
  })
  return () => {
    unsubscribe()
    if (persistenceTimer) clearTimeout(persistenceTimer)
    persistenceTimer = null
    enqueueSession()
  }
}

export async function refreshTree(): Promise<void> {
  const s = useStore.getState()
  if (!s.folder || s.screen !== 'session') return
  const folder = s.folder
  await Promise.all([...new Set([folder, ...s.expanded])].map(async (dir) => {
    const result = await api.readDir(dir)
    if (useStore.getState().folder === folder) useStore.getState().setTree(dir, result.ok ? visibleEntries(result.value) : null)
  }))
}

function visibleEntries(entries: DirEntry[]): DirEntry[] {
  return entries.filter((e) => !e.name.startsWith('.')).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, 'ko'))
}

export async function toggleDirectory(path: string): Promise<void> {
  const s = useStore.getState()
  const opening = !s.expanded.includes(path)
  s.setExpanded(path, opening)
  if (!opening) return
  const folder = s.folder
  const result = await api.readDir(path)
  if (useStore.getState().folder === folder) useStore.getState().setTree(path, result.ok ? visibleEntries(result.value) : null)
}

/** 마지막 참조가 사라지는 문서만 저장하고, 실패한 변경을 버릴 때는 반드시 묻는다. */
export async function allowLeaving(next: Workspace[]): Promise<boolean> {
  const keep = referencedKeys(next)
  const leaving = [...referencedKeys(useStore.getState().workspaces)].filter((k) => !keep.has(k))
  const failed: string[] = []
  for (const key of leaving) if (!(await docs.flush(key))) failed.push(key)
  if (!failed.length) return true
  const choice = await confirmModal({ title: '저장되지 않은 변경', message: '저장에 실패했거나 외부 파일과 충돌했습니다. 변경을 버리고 닫을까요?',
    details: failed.map((k) => titleOfKey(k, useStore.getState().scratches)),
    buttons: [{ id: 'cancel', label: '돌아가기' }, { id: 'discard', label: '변경 버리고 닫기', kind: 'danger' }] })
  if (choice !== 'discard') return false
  failed.forEach(docs.allowDiscard)
  return true
}

async function leaveCurrent(): Promise<boolean> {
  if (useStore.getState().screen !== 'session') return true
  if (!(await allowLeaving([])) || !(await flushSession())) return false
  return true
}

async function enter(folder: string | null): Promise<boolean> {
  const [raw, root] = await Promise.all([
    api.loadSession(folder), folder ? api.readDir(folder) : Promise.resolve(null)
  ])
  if (root && !root.ok) { toast(`폴더를 열지 못했습니다: ${root.message}`, 'error'); return false }
  // 새 세션을 읽지 못한 경우 현재 작업을 그대로 유지한다.
  if (!(await leaveCurrent())) return false
  const scratches = await api.scratchList()
  const restored = restoreSession(raw, new Set(scratches.map((m) => m.id)))
  const paths = [...new Set(allLeaves(restored.workspaces).flatMap((l) => l.doc?.type === 'file' ? [l.doc.path] : []))]
  const canonical = new Map(await Promise.all(paths.map(async (path) => {
    try { return [path, (await api.resolvePath(path)).path] as const }
    catch { return [path, path] as const } // 읽기 실패는 문서 영역에 표시하며 참조는 보존한다.
  })))
  const session = { ...restored, workspaces: retarget(restored.workspaces, (ref) => ref.type === 'file' ? { ...ref, path: canonical.get(ref.path) ?? ref.path } : ref) }
  await api.setLast(folder ?? '')
  await docs.discardAll()
  useStore.setState((s) => ({ scratches, recent: folder ? [folder, ...s.recent.filter((p) => p !== folder)].slice(0, 12) : s.recent }))
  useStore.getState().enterSession(folder, session, root?.ok ? visibleEntries(root.value) : null)
  for (const leaf of allLeaves(session.workspaces)) if (leaf.doc) docs.open(leaf.doc)
  await api.watchFolder(folder)
  void refreshTree()
  return true
}

export async function initialize(): Promise<void> {
  try {
    const [app, scratches] = await Promise.all([api.loadAppState(), api.scratchList()])
    useStore.setState({ recent: app.recent, scratches })
    if (app.last !== null && await withBusy(() => enter(app.last === '' ? null : app.last))) return
  } catch (e) { toast(`이전 작업을 복원하지 못했습니다: ${String(e)}`, 'error') }
  useStore.getState().leaveSession()
}

export async function openFolder(path?: string): Promise<void> {
  const folder = path ?? await api.pickFolder()
  if (folder === null) return
  if (useStore.getState().screen === 'session' && useStore.getState().folder === folder) return
  await withBusy(() => enter(folder))
}

export async function showStart(): Promise<void> {
  await withBusy(async () => {
    if (!(await leaveCurrent())) return
    await api.setLast(null)
    await docs.discardAll()
    useStore.getState().leaveSession()
    await api.watchFolder(null)
    await api.watchFiles([])
  })
}

async function ensureSession(): Promise<boolean> {
  return useStore.getState().screen === 'session' || enter(null)
}

export async function openDocument(ref: DocRef, right = false, line?: number, query?: string): Promise<void> {
  if (ref.type === 'file' && !isSupported(basename(ref.path))) { toast('Markdown, TXT, 확장자 없는 텍스트 파일만 열 수 있습니다.'); return }
  await withBusy(async () => {
    if (ref.type === 'file') ref = { type: 'file', path: (await api.resolvePath(ref.path)).path }
    if (!(await ensureSession())) return
    const s = useStore.getState()
    const ws = activeWorkspaceOf(s), leaf = activeLeafOf(s)
    if (!ws || !leaf) return
    const added = makeLeaf(ref)
    const next = right ? splitLeafIn(s.workspaces, ws.id, leaf.id, 'row', added) : setLeafDoc(s.workspaces, ws.id, leaf.id, ref)
    if (!(await allowLeaving(next))) return
    docs.open(ref)
    s.setWorkspaces(() => next)
    if (line !== undefined) useStore.setState({ reveal: { leafId: right ? added.id : leaf.id, line, query } })
  })
}

export async function openFiles(): Promise<void> {
  const paths = await api.pickFiles()
  for (let i = 0; i < paths.length; i++) await openDocument({ type: 'file', path: paths[i] }, i > 0)
}

export async function newScratch(): Promise<void> {
  const meta = { id: newId(), kind: 'txt' as const, title: '임시 메모', updatedAt: Date.now() }
  // 생성 자체가 저장이다. 성공하기 전에는 목록에 올리지 않는다.
  await api.scratchWrite(meta, '')
  useStore.getState().upsertScratch(meta, true)
  await openDocument({ type: 'scratch', id: meta.id })
}

export async function closePane(wsId?: string, leafId?: string): Promise<void> {
  await withBusy(async () => {
    const s = useStore.getState(), ws = activeWorkspaceOf(s)
    const next = closeLeafIn(s.workspaces, wsId ?? ws?.id ?? '', leafId ?? ws?.activeLeaf ?? '')
    if (await allowLeaving(next)) s.setWorkspaces(() => next)
  })
}

export function splitPane(dir: Split['dir']): void {
  const s = useStore.getState(), ws = activeWorkspaceOf(s), leaf = activeLeafOf(s)
  if (!ws || !leaf) return
  s.setWorkspaces((items) => splitLeafIn(items, ws.id, leaf.id, dir, makeLeaf(leaf.doc, leaf.mode)))
}

export async function renameWorkspace(id: string): Promise<void> {
  const ws = useStore.getState().workspaces.find((w) => w.id === id)
  if (!ws) return
  const name = await promptModal({ title: '워크스페이스 이름 변경', initial: ws.name, submit: (v) => v.trim() ? null : '이름을 입력하세요.' })
  if (name !== null) useStore.getState().renameWorkspace(id, name)
}

export async function deleteWorkspace(id: string): Promise<void> {
  await withBusy(async () => {
    const s = useStore.getState()
    if (s.workspaces.length <= 1) return
    const next = s.workspaces.filter((w) => w.id !== id)
    if (!(await allowLeaving(next))) return
    useStore.setState({ workspaces: next, visited: s.visited.filter((v) => v !== id), activeWorkspace: s.activeWorkspace === id ? next[0].id : s.activeWorkspace })
    useStore.getState().switchWorkspace(useStore.getState().activeWorkspace)
    useStore.setState((st) => ({ visited: [...new Set([...st.visited, st.activeWorkspace])] }))
  })
}

export async function createEntry(dir: string | null, kind: DocKind | 'folder'): Promise<void> {
  if (!dir) {
    if (kind === 'folder') { toast('먼저 폴더를 여세요.'); return }
    const path = await api.pickSave(`새 문서.${kind}`, kind)
    if (!path) return
    const result = await api.createFile(path)
    if (!result.ok) { toast(result.message, 'error'); return }
    await openDocument({ type: 'file', path })
    return
  }
  let created: string | null = null
  await promptModal({ title: kind === 'folder' ? '새 폴더' : `새 ${kind === 'md' ? 'Markdown' : '텍스트'} 파일`,
    initial: kind === 'folder' ? '새 폴더' : `새 문서.${kind}`, selectEnd: kind === 'folder' ? undefined : 4,
    submit: async (value) => {
      const error = invalidName(value)
      if (error) return error
      const path = join(dir, value.trim())
      if (kind !== 'folder' && !isSupported(value.trim())) return '확장자는 .md, .markdown, .txt를 사용하세요.'
      const result = kind === 'folder' ? await api.createDir(path) : await api.createFile(path)
      if (!result.ok) return result.message
      created = path
      return null
    } })
  await refreshTree()
  if (created && kind !== 'folder') await openDocument({ type: 'file', path: created })
}

export async function renameEntry(path: string): Promise<void> {
  const oldName = basename(path)
  const name = await promptModal({ title: '이름 변경', initial: oldName, selectEnd: oldName.lastIndexOf('.') > 0 ? oldName.lastIndexOf('.') : oldName.length, submit: invalidName })
  if (name === null || name.trim() === oldName) return
  await withBusy(async () => {
    const resolved = await api.resolvePath(path)
    if ((await docs.flushUnder(resolved.path)).length) { toast('변경을 먼저 저장하거나 충돌을 해결한 뒤 이름을 바꾸세요.', 'error'); return }
    const target = join(dirname(path), name.trim())
    const moved = join(dirname(resolved.path), name.trim())
    if (docs.openKeys().some((k) => k.startsWith('file:') && isInside(k.slice(5), moved))) {
      toast('새 경로의 문서가 이미 열려 있습니다. 먼저 닫아 주세요.', 'error'); return
    }
    const result = await api.rename(path, target)
    if (!result.ok) { toast(result.message, 'error'); return }
    if (!resolved.isSymlink) docs.movePaths(resolved.path, moved)
    await refreshTree()
  })
}

export async function trashEntry(path: string): Promise<void> {
  const choice = await confirmModal({ title: '휴지통으로 이동', message: `“${basename(path)}”을 휴지통으로 옮길까요? 폴더 안의 항목도 함께 이동합니다.`,
    buttons: [{ id: 'cancel', label: '취소' }, { id: 'trash', label: '휴지통으로 이동', kind: 'danger' }] })
  if (choice !== 'trash') return
  await withBusy(async () => {
    const resolved = await api.resolvePath(path)
    if ((await docs.flushUnder(resolved.path)).length) { toast('변경을 먼저 저장하거나 충돌을 해결한 뒤 삭제하세요.', 'error'); return }
    const result = await api.trash(path)
    if (!result.ok) { toast(result.message, 'error'); return }
    if (!resolved.isSymlink) {
      await docs.discardUnder(resolved.path)
      useStore.getState().setWorkspaces((w) => retarget(w, (r) => r.type === 'file' && isInside(r.path, resolved.path) ? null : r))
    }
    useStore.setState((s) => ({ expanded: s.expanded.filter((p) => !isInside(p, path)) }))
    await refreshTree()
  })
}

export async function deleteScratch(id: string): Promise<void> {
  const choice = await confirmModal({ title: '임시 메모 삭제', message: '보관된 임시 메모를 영구 삭제할까요?', buttons: [
    { id: 'cancel', label: '취소' }, { id: 'delete', label: '삭제', kind: 'danger' }
  ] })
  if (choice !== 'delete') return
  await withBusy(async () => {
    const key = docKey({ type: 'scratch', id })
    if (!(await docs.flush(key))) { toast('임시 메모 저장에 실패했습니다. 저장을 재시도하세요.', 'error'); return }
    await api.scratchRemove(id)
    await docs.discard(key)
    useStore.getState().removeScratch(id)
    useStore.getState().setWorkspaces((w) => retarget(w, (r) => r.type === 'scratch' && r.id === id ? null : r))
  })
}

export async function saveActive(): Promise<void> {
  const leaf = activeLeafOf(useStore.getState())
  if (!leaf?.doc) return
  const ref = leaf.doc, key = docKey(ref)
  if (ref.type === 'file') {
    if (!(await docs.flush(key))) toast('파일을 저장하지 못했습니다. 영역 위의 저장 상태를 확인하세요.', 'error')
    return
  }
  const kind = docs.kindOfDoc(key) ?? 'txt'
  const path = await api.pickSave(`임시 메모.${kind}`, kind)
  if (!path) return
  if (!isSupported(basename(path))) { toast('지원하는 텍스트 파일 이름으로 저장하세요.', 'error'); return }
  await withBusy(async () => {
    if (!(await docs.flush(key))) { toast('임시 메모 저장에 실패했습니다.', 'error'); return }
    const content = docs.contentOf(key)
    if (content === null) return
    const targetPath = (await api.resolvePath(path)).path
    const targetKey = docKey({ type: 'file', path: targetPath })
    if (!(await docs.flush(targetKey))) { toast('대상 파일의 열린 변경을 먼저 저장하세요.', 'error'); return }
    const existing = await api.readFile(targetPath)
    if (!existing.ok && existing.reason !== 'missing') { toast('대상 파일을 안전하게 확인할 수 없습니다. 다른 이름을 선택하세요.', 'error'); return }
    if (existing.ok) {
      const choice = await confirmModal({ title: '기존 파일 덮어쓰기', message: `“${basename(path)}”의 내용을 바꿀까요?`, buttons: [
        { id: 'cancel', label: '취소' }, { id: 'overwrite', label: '덮어쓰기', kind: 'danger' }
      ] })
      if (choice !== 'overwrite') return
    }
    // create-new로 경합 중 새로 생긴 파일을 덮어쓰지 않는다.
    if (!existing.ok) {
      const created = await api.createFile(targetPath)
      if (!created.ok) { toast(created.message, 'error'); return }
    }
    const disk = existing.ok ? existing : await api.readFile(targetPath)
    if (!disk.ok) { toast('저장 대상 파일을 읽지 못했습니다.', 'error'); return }
    if (!existing.ok && disk.data.content !== '') { toast('새 저장 대상에 외부 내용이 쓰였습니다. 임시 메모를 유지합니다.', 'error'); return }
    const format = docs.formatOf(key) ?? { eol: '\n' as const, bom: false }
    const result = await api.writeFile(targetPath, content, { ...format, expectedMtimeMs: disk.data.mtimeMs, expectedRaw: disk.data.raw ?? encodeText(disk.data.content, disk.data.eol, disk.data.bom) })
    if (!result.ok) { toast(result.reason === 'conflict' ? '저장 위치의 파일이 바뀌었습니다. 임시 메모를 유지합니다.' : result.message ?? '저장 실패', 'error'); return }
    // 삭제에 실패하면 임시 메모를 남겨 두어 언제든 복구할 수 있다.
    try { await api.scratchRemove(ref.id) } catch (e) { toast(`파일은 저장했지만 임시 메모를 제거하지 못했습니다: ${String(e)}`, 'error'); return }
    await docs.discard(key)
    useStore.getState().removeScratch(ref.id)
    docs.open({ type: 'file', path: targetPath })
    useStore.getState().setWorkspaces((w) => retarget(w, (r) => docKey(r) === key ? { type: 'file', path: targetPath } : r))
    await docs.checkDisk(targetKey)
    await refreshTree()
  })
}

export async function resolveConflict(key: string, choice: 'reload' | 'overwrite'): Promise<void> {
  const answer = await confirmModal({ title: choice === 'reload' ? '디스크 내용 불러오기' : '내 내용으로 덮어쓰기',
    message: choice === 'reload' ? '이 문서의 저장되지 않은 변경을 버리고 디스크 내용을 불러올까요?' : '현재 디스크 파일을 편집기 내용으로 바꿀까요?',
    buttons: [{ id: 'cancel', label: '취소' }, { id: 'apply', label: choice === 'reload' ? '불러오기' : '덮어쓰기', kind: 'danger' }] })
  if (answer === 'apply') await withBusy(async () => { await (choice === 'reload' ? docs.reloadFromDisk(key) : docs.overwriteDisk(key)) })
}

export async function copyDropped(paths: string[], destination: string): Promise<void> {
  if (!paths.length) return
  await withBusy(async () => {
    for (const source of paths) {
      let mode: 'fail' | 'overwrite' | 'keep-both' = 'fail'
      // 재귀 복사로 자기 자신을 덮어쓰거나 안쪽에 복사하는 것을 막는다.
      if (isInside(destination, source)) { toast('자기 자신이나 그 하위 폴더로 복사할 수 없습니다.', 'error'); continue }
      const existing = await api.existingNames([source], destination)
      if (existing.length) {
        const choice = await confirmModal({ title: '같은 이름의 항목', message: `“${basename(source)}”이 대상 폴더에 있습니다.`, buttons: [
          { id: 'skip', label: '건너뛰기' }, { id: 'keep-both', label: '둘 다 유지', kind: 'primary' }, { id: 'overwrite', label: '덮어쓰기', kind: 'danger' }
        ] })
        if (choice !== 'keep-both' && choice !== 'overwrite') continue
        mode = choice
        if (mode === 'overwrite') {
          const target = join(destination, basename(source))
          if (source === target) { toast('원본과 복사 대상이 같습니다.', 'error'); continue }
          if ((await docs.flushUnder((await api.resolvePath(target)).path)).length) { toast('대상의 변경을 먼저 저장하거나 충돌을 해결하세요.', 'error'); continue }
        }
      }
      const result = await api.copyPath(source, destination, mode)
      if (!result.ok) toast(result.message, 'error')
    }
    docs.checkAll()
    await refreshTree()
  })
}

/** api.ts의 창 이벤트 래퍼에서 호출할 종료 게이트. false면 창을 닫지 않는다. */
export async function prepareClose(): Promise<boolean> {
  return withBusy(async () => {
    const failed = await docs.flushAll()
    if (failed.length) {
      const choice = await confirmModal({ title: '종료 전에 저장이 필요합니다', message: '충돌 또는 저장 오류가 있습니다. 돌아가서 해결하거나 저장되지 않은 내용을 버리고 종료하세요.',
        details: failed.map((k) => titleOfKey(k, useStore.getState().scratches)), buttons: [
          { id: 'cancel', label: '돌아가기', kind: 'primary' }, { id: 'discard', label: '변경 버리고 종료', kind: 'danger' }
        ] })
      if (choice !== 'discard') return false
    }
    return flushSession()
  })
}

export async function handleMenu(cmd: MenuCommand): Promise<void> {
  if (useStore.getState().busy || useStore.getState().modals.length) return
  const s = useStore.getState(), ws = activeWorkspaceOf(s), leaf = activeLeafOf(s)
  const view = leaf && docs.leafViews.get(leaf.id)
  switch (cmd) {
    case 'new-scratch': await newScratch(); break
    case 'new-file': await createEntry(s.folder, 'md'); break
    case 'open-folder': await openFolder(); break
    case 'open-file': await openFiles(); break
    case 'save': await saveActive(); break
    case 'close-folder': await showStart(); break
    case 'split-right': splitPane('row'); break
    case 'split-down': splitPane('column'); break
    case 'close-pane': await closePane(); break
    case 'toggle-mode': if (ws && leaf) s.setLeafMode(ws.id, leaf.id, leaf.mode === 'live' ? 'source' : 'live'); break
    case 'new-workspace': await withBusy(async () => { if (await ensureSession()) useStore.getState().addWorkspace() }); break
    case 'search': useStore.setState({ sidebarOpen: true, sidebarTab: 'search', searchFocus: s.searchFocus + 1 }); break
    case 'insert-table': if (view && leaf?.doc && docs.kindOfDoc(docKey(leaf.doc)) === 'md') insertTable(view); break
    case 'undo': if (view) runUndo(view); break
    case 'redo': if (view) runRedo(view); break
    default: { const exhaustive: never = cmd; return exhaustive }
  }
}

/** 이벤트와 버튼에서 발생한 비동기 오류를 사용자에게 보인다. */
export function perform(work: () => void | Promise<unknown>): void {
  try { Promise.resolve(work()).catch((e) => toast(String(e), 'error')) } catch (e) { toast(String(e), 'error') }
}
