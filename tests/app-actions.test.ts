import { ChangeSet } from '@codemirror/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import * as docs from '../src/docs'
import { closePane, copyDropped, deleteScratch, flushSession, handleMenu, newScratch, openDocument, openFolder, prepareClose, renameEntry, saveActive, startSessionPersistence, trashEntry } from '../src/actions'
import { defaultSession, useStore } from '../src/store'
import { leaves, makeLeaf } from '../src/shared/layout'

vi.mock('../src/editor', () => ({ insertTable: vi.fn(), runUndo: vi.fn(), runRedo: vi.fn() }))
vi.mock('../src/api', () => ({ api: {
  resolvePath: vi.fn(async (path: string) => ({ path: path.replace('/shortcut/', '/notes/'), isSymlink: false })),
  loadSession: vi.fn(), saveSession: vi.fn(), scratchList: vi.fn(), scratchRead: vi.fn(), scratchWrite: vi.fn(), scratchRemove: vi.fn(),
  readFile: vi.fn(), writeFile: vi.fn(), readDir: vi.fn(), rename: vi.fn(), trash: vi.fn(), pickSave: vi.fn(),
  createFile: vi.fn(), existingNames: vi.fn(), copyPath: vi.fn(), setLast: vi.fn(), watchFolder: vi.fn(), watchFiles: vi.fn()
} }))
const key = 'file:/notes/a.md'
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
function choose(value: string | null) {
  const modal = useStore.getState().modals.at(-1)
  expect(modal).toBeDefined()
  modal!.resolve(value)
}
async function opened() {
  const session = defaultSession()
  const leaf = leaves(session.workspaces[0].layout)[0]
  leaf.doc = { type: 'file', path: '/notes/a.md' }
  useStore.getState().enterSession('/notes', session, [])
  docs.open(leaf.doc); await tick()
  const text = docs.textOf(key)!, changes = ChangeSet.of({ from: text.length, insert: '!' }, text.length)
  docs.localChange(key, { getDoc: () => changes.apply(text), applyRemote() {}, replaceContent() {} }, changes)
  return { session, leaf }
}

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); docs.resetForTest(); useStore.setState(useStore.getInitialState(), true)
  vi.mocked(api.resolvePath).mockImplementation(async (path) => ({ path: path.replace('/shortcut/', '/notes/'), isSymlink: false }))
  vi.mocked(api.readFile).mockResolvedValue({ ok: true, data: { content: '원문', mtimeMs: 1, eol: '\n', bom: false } })
  vi.mocked(api.writeFile).mockResolvedValue({ ok: true, mtimeMs: 2 })
  vi.mocked(api.readDir).mockResolvedValue({ ok: true, value: [] })
  vi.mocked(api.rename).mockResolvedValue({ ok: true, value: undefined })
  vi.mocked(api.trash).mockResolvedValue({ ok: true, value: undefined })
  vi.mocked(api.createFile).mockResolvedValue({ ok: true, value: undefined })
  vi.mocked(api.existingNames).mockResolvedValue([])
  vi.mocked(api.copyPath).mockResolvedValue({ ok: true, value: '/notes/a.md' })
  vi.mocked(api.loadSession).mockResolvedValue(null)
  vi.mocked(api.scratchList).mockResolvedValue([])
})
afterEach(async () => { await flushSession(); docs.resetForTest(); vi.clearAllTimers(); vi.useRealTimers() })

describe('데이터를 잃지 않는 파일 동작', () => {
  it('이름 변경은 저장 완료 뒤에 실행하고 열린 경로도 이동한다', async () => {
    await opened()
    let finish!: (v: { ok: true; mtimeMs: number }) => void
    vi.mocked(api.writeFile).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const renaming = renameEntry('/notes/a.md')
    choose('b.md'); await tick()
    expect(api.rename).not.toHaveBeenCalled()
    finish({ ok: true, mtimeMs: 3 }); await renaming
    expect(api.rename).toHaveBeenCalledWith('/notes/a.md', '/notes/b.md')
    expect(leaves(useStore.getState().workspaces[0].layout)[0].doc).toEqual({ type: 'file', path: '/notes/b.md' })
    expect(docs.has('file:/notes/b.md')).toBe(true)
  })
  it('저장 실패 시 이름 변경과 휴지통 이동을 중단한다', async () => {
    await opened()
    vi.mocked(api.writeFile).mockResolvedValue({ ok: false, reason: 'error', message: '권한 없음' })
    const renaming = renameEntry('/notes/a.md'); choose('b.md'); await renaming
    expect(api.rename).not.toHaveBeenCalled()
    const deleting = trashEntry('/notes/a.md'); choose('trash'); await deleting
    expect(api.trash).not.toHaveBeenCalled()
    expect(docs.contentOf(key)).toBe('원문!')
  })
  it('휴지통 이동 전 대기 중인 저장을 끝내고 문서 참조를 정리한다', async () => {
    await opened()
    const deleting = trashEntry('/notes/a.md'); choose('trash'); await deleting
    expect(vi.mocked(api.writeFile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.trash).mock.invocationCallOrder[0])
    expect(leaves(useStore.getState().workspaces[0].layout)[0].doc).toBeNull()
    expect(docs.has(key)).toBe(false)
  })
  it('마지막 참조를 닫을 때 저장 실패를 묻고 취소하면 그대로 둔다', async () => {
    const { session, leaf } = await opened()
    vi.mocked(api.writeFile).mockResolvedValue({ ok: false, reason: 'error', message: '디스크 꽉 참' })
    const closing = closePane(session.activeWorkspace, leaf.id); await tick(); choose(null); await closing
    expect(leaves(useStore.getState().workspaces[0].layout)[0].doc).not.toBeNull()
  })
  it('같은 문서의 다른 영역이 남으면 닫기 확인이 필요 없다', async () => {
    const { session, leaf } = await opened()
    const added = makeLeaf(leaf.doc)
    useStore.getState().setWorkspaces((ws) => [{ ...ws[0], layout: { type: 'split', id: 'split', dir: 'row', sizes: [.5, .5], children: [leaf, added] } }])
    await closePane(session.activeWorkspace, leaf.id)
    expect(useStore.getState().modals).toHaveLength(0)
    expect(api.writeFile).not.toHaveBeenCalled()
  })
  it('세션 전환 대상의 읽기 실패 시 현재 작업을 유지한다', async () => {
    await opened()
    vi.mocked(api.readDir).mockResolvedValue({ ok: false, message: '폴더 없음' })
    await openFolder('/missing')
    expect(useStore.getState().folder).toBe('/notes')
    expect(docs.contentOf(key)).toBe('원문!')
  })
})

describe('종료와 화면 저장', () => {
  it('종료는 모든 문서 저장과 화면 저장을 기다린다', async () => {
    await opened()
    expect(await prepareClose()).toBe(true)
    expect(api.writeFile).toHaveBeenCalled()
    expect(api.saveSession).toHaveBeenCalledWith('/notes', expect.objectContaining({ activeWorkspace: useStore.getState().activeWorkspace }))
  })
  it('저장 오류로 종료를 취소할 수 있고 화면 저장 실패도 종료를 막는다', async () => {
    await opened()
    vi.mocked(api.writeFile).mockResolvedValue({ ok: false, reason: 'error', message: '쓰기 실패' })
    const close = prepareClose(); await tick(); choose('cancel'); expect(await close).toBe(false)
    vi.mocked(api.writeFile).mockResolvedValue({ ok: true, mtimeMs: 2 })
    vi.mocked(api.saveSession).mockRejectedValueOnce(new Error('화면 저장 실패'))
    expect(await prepareClose()).toBe(false)
  })
  it('빠른 화면 변경은 디바운스하고 저장 호출은 순서대로 실행한다', async () => {
    await opened()
    const stop = startSessionPersistence()
    useStore.getState().addWorkspace(); useStore.getState().addWorkspace()
    await vi.advanceTimersByTimeAsync(299)
    expect(api.saveSession).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.saveSession).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.saveSession).mock.calls[0][1].workspaces).toHaveLength(3)
    stop()
  })
})

describe('임시 메모와 외부 복사', () => {
  it('새 임시 메모는 생성 즉시 저장한 뒤 화면에 연다', async () => {
    const session = defaultSession(); useStore.getState().enterSession(null, session, null)
    vi.mocked(api.scratchRead).mockResolvedValue('')
    await newScratch(); await tick()
    expect(api.scratchWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: 'txt' }), '')
    expect(leaves(useStore.getState().workspaces[0].layout)[0].doc?.type).toBe('scratch')
  })
  it('파일 쓰기 실패 시 임시 메모를 삭제하지 않는다', async () => {
    const session = defaultSession(), leaf = leaves(session.workspaces[0].layout)[0]
    leaf.doc = { type: 'scratch', id: 'scratch1' }
    useStore.getState().enterSession(null, session, null)
    vi.mocked(api.scratchRead).mockResolvedValue('보존할 내용')
    docs.open(leaf.doc); await tick()
    vi.mocked(api.pickSave).mockResolvedValue('/export.txt')
    vi.mocked(api.readFile).mockResolvedValueOnce({ ok: false, reason: 'missing' }).mockResolvedValue({ ok: true, data: { content: '', mtimeMs: 2, eol: '\n', bom: false } })
    vi.mocked(api.writeFile).mockResolvedValue({ ok: false, reason: 'error', message: '실패' })
    await saveActive()
    expect(api.scratchRemove).not.toHaveBeenCalled()
    expect(docs.contentOf('scratch:scratch1')).toBe('보존할 내용')
  })
  it('임시 메모 삭제 실패 시 내용과 열린 참조를 유지한다', async () => {
    vi.mocked(api.scratchRemove).mockRejectedValueOnce(new Error('삭제 실패'))
    const deleting = deleteScratch('s'); choose('delete')
    await expect(deleting).rejects.toThrow('삭제 실패')
    expect(useStore.getState().busy).toBe(0)
  })
  it('복사 이름 충돌에서 취소하면 원본과 대상을 건드리지 않는다', async () => {
    vi.mocked(api.existingNames).mockResolvedValue(['a.md'])
    const copying = copyDropped(['/external/a.md'], '/notes'); await tick(); choose(null); await copying
    expect(api.copyPath).not.toHaveBeenCalled()
  })
  it('복사 충돌에서 둘 다 유지를 명시적으로 전달한다', async () => {
    vi.mocked(api.existingNames).mockResolvedValue(['a.md'])
    const copying = copyDropped(['/external/a.md'], '/notes'); await tick(); choose('keep-both'); await copying
    expect(api.copyPath).toHaveBeenCalledWith('/external/a.md', '/notes', 'keep-both')
  })
  it('모달 중 네이티브 메뉴 명령을 무시한다', async () => {
    const deleting = deleteScratch('s')
    await handleMenu('new-scratch')
    expect(api.scratchWrite).not.toHaveBeenCalled()
    choose(null); await deleting
  })
})

describe('저장 직렬화와 충돌 보호', () => {
  it('진행 중인 세션 저장이 끝나기 전에는 다음 화면 저장을 시작하지 않는다', async () => {
    await opened()
    const stop = startSessionPersistence()
    let finish!: () => void
    vi.mocked(api.saveSession).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    useStore.getState().addWorkspace()
    await vi.advanceTimersByTimeAsync(300)
    expect(api.saveSession).toHaveBeenCalledTimes(1)
    useStore.getState().addWorkspace()
    await vi.advanceTimersByTimeAsync(300)
    expect(api.saveSession).toHaveBeenCalledTimes(1)
    finish(); await tick()
    expect(api.saveSession).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.saveSession).mock.calls[1][1].workspaces).toHaveLength(3)
    stop()
  })
  it('충돌이 있으면 종료 확인을 거치며 취소 시 쓰기를 시도하지 않는다', async () => {
    await opened()
    vi.mocked(api.readFile).mockResolvedValue({ ok: true, data: { content: '외부 변경', mtimeMs: 3, eol: '\n', bom: false } })
    await docs.checkDisk(key)
    const closing = prepareClose(); await tick(); choose(null)
    expect(await closing).toBe(false)
    expect(api.writeFile).not.toHaveBeenCalled()
    expect(docs.contentOf(key)).toBe('원문!')
  })
  it('충돌 대상에는 사용자가 복사 덮어쓰기를 골라도 먼저 해결하기 전까지 복사하지 않는다', async () => {
    await opened()
    vi.mocked(api.readFile).mockResolvedValue({ ok: true, data: { content: '외부 변경', mtimeMs: 3, eol: '\n', bom: false } })
    await docs.checkDisk(key)
    vi.mocked(api.existingNames).mockResolvedValue(['a.md'])
    const copying = copyDropped(['/outside/a.md'], '/notes'); await tick(); choose('overwrite'); await copying
    expect(api.copyPath).not.toHaveBeenCalled()
    expect(api.writeFile).not.toHaveBeenCalled()
  })
  it('임시 메모를 실제 파일로 저장하면 모든 열린 참조를 함께 바꾼다', async () => {
    const session = defaultSession(), ws = session.workspaces[0], leaf = leaves(ws.layout)[0]
    leaf.doc = { type: 'scratch', id: 's1' }
    ws.layout = { type: 'split', id: 'sp', dir: 'row', sizes: [.5, .5], children: [leaf, makeLeaf(leaf.doc)] }
    useStore.getState().enterSession(null, session, null)
    useStore.getState().upsertScratch({ id: 's1', kind: 'txt', title: '보존', updatedAt: 0 })
    vi.mocked(api.scratchRead).mockResolvedValue('보존')
    docs.open(leaf.doc); await tick()
    vi.mocked(api.pickSave).mockResolvedValue('/export.txt')
    vi.mocked(api.readFile).mockResolvedValueOnce({ ok: false, reason: 'missing' }).mockResolvedValue({ ok: true, data: { content: '', mtimeMs: 2, eol: '\n', bom: false } })
    await saveActive()
    expect(api.scratchRemove).toHaveBeenCalledWith('s1')
    expect(vi.mocked(api.writeFile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.scratchRemove).mock.invocationCallOrder[0])
    expect(leaves(useStore.getState().workspaces[0].layout).every((l) => l.doc?.type === 'file' && l.doc.path === '/export.txt')).toBe(true)
    expect(useStore.getState().scratches).toHaveLength(0)
  })
  it('새 파일 생성 직후 외부 내용이 생겼으면 임시 메모 변환을 중단한다', async () => {
    const session = defaultSession(), leaf = leaves(session.workspaces[0].layout)[0]
    leaf.doc = { type: 'scratch', id: 's1' }
    useStore.getState().enterSession(null, session, null)
    vi.mocked(api.scratchRead).mockResolvedValue('보존')
    docs.open(leaf.doc); await tick()
    vi.mocked(api.pickSave).mockResolvedValue('/export.txt')
    vi.mocked(api.readFile).mockResolvedValueOnce({ ok: false, reason: 'missing' }).mockResolvedValue({ ok: true, data: { content: '외부 내용', mtimeMs: 2, eol: '\n', bom: false } })
    await saveActive()
    expect(api.writeFile).not.toHaveBeenCalled()
    expect(api.scratchRemove).not.toHaveBeenCalled()
  })
})

describe('세션 전환 데이터 안전성', () => {
  it('현재 임시 메모의 대기 저장을 끝낸 뒤 새 세션용 메타데이터를 읽는다', async () => {
    const session = defaultSession(), leaf = leaves(session.workspaces[0].layout)[0]
    leaf.doc = { type: 'scratch', id: 's1' }
    useStore.getState().enterSession('/old', session, [])
    useStore.getState().upsertScratch({ id: 's1', kind: 'txt', title: '이전 제목', updatedAt: 0 })
    vi.mocked(api.scratchRead).mockResolvedValue('원문')
    docs.open(leaf.doc); await tick()
    const text = docs.textOf('scratch:s1')!, changes = ChangeSet.of({ from: text.length, insert: ' 새 제목' }, text.length)
    docs.localChange('scratch:s1', { getDoc: () => changes.apply(text), applyRemote() {}, replaceContent() {} }, changes)
    let title = '이전 제목'
    vi.mocked(api.scratchWrite).mockImplementation(async (meta) => { title = meta.title })
    vi.mocked(api.scratchList).mockImplementation(async () => [{ id: 's1', kind: 'txt', title, updatedAt: 1 }])
    await openFolder('/new')
    expect(useStore.getState().scratches[0].title).toBe('원문 새 제목')
  })
})

it('같은 파일의 별칭 경로를 두 영역에서 열어도 문서 세션과 읽기는 하나다', async () => {
  useStore.getState().enterSession('/notes', defaultSession(), [])
  await openDocument({ type: 'file', path: '/notes/a.md' })
  await openDocument({ type: 'file', path: '/shortcut/a.md' }, true)
  await tick()
  const refs = leaves(useStore.getState().workspaces[0].layout).map((l) => l.doc)
  expect(refs).toEqual([{ type: 'file', path: '/notes/a.md' }, { type: 'file', path: '/notes/a.md' }])
  expect(api.readFile).toHaveBeenCalledTimes(1)
})
