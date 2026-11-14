import { ChangeSet, Text } from '@codemirror/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import * as docs from '../src/docs'
import { docKey, useStore } from '../src/store'
import type { ReadResult } from '../src/shared/types'

vi.mock('../src/api', () => ({ api: {
  readFile: vi.fn(), writeFile: vi.fn(), scratchRead: vi.fn(), scratchWrite: vi.fn()
} }))
const key = 'file:/notes/a.md'
const disk = (content: string, mtimeMs = 1): ReadResult => ({ ok: true, data: { content, mtimeMs, eol: '\r\n', bom: true } })
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

async function open(content = '원문') {
  vi.mocked(api.readFile).mockResolvedValue(disk(content))
  docs.open({ type: 'file', path: '/notes/a.md' })
  await tick()
}
function edit(insert: string) {
  const text = docs.textOf(key)!
  const changes = ChangeSet.of({ from: text.length, insert }, text.length)
  docs.localChange(key, { getDoc: () => changes.apply(text), applyRemote() {}, replaceContent() {} }, changes)
}

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks()
  docs.resetForTest(); useStore.setState(useStore.getInitialState(), true)
  vi.mocked(api.writeFile).mockResolvedValue({ ok: true, mtimeMs: 2 })
})
afterEach(() => { docs.resetForTest(); vi.clearAllTimers(); vi.useRealTimers() })

describe('문서 세션과 저장', () => {
  it('같은 문서를 한 번만 읽고 다른 뷰에 변경을 한 번 전달한다', async () => {
    await open()
    docs.open({ type: 'file', path: '/notes/a.md' })
    const first: docs.DocView = { getDoc: () => Text.of(['원문!']), applyRemote: vi.fn(), replaceContent: vi.fn() }
    const other: docs.DocView = { getDoc: () => Text.of(['원문']), applyRemote: vi.fn(), replaceContent: vi.fn() }
    docs.attach(key, first); docs.attach(key, other)
    docs.localChange(key, first, ChangeSet.of({ from: 2, insert: '!' }, 2))
    expect(api.readFile).toHaveBeenCalledTimes(1)
    expect(other.applyRemote).toHaveBeenCalledTimes(1)
    expect(first.applyRemote).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(800)
    expect(api.writeFile).toHaveBeenCalledWith('/notes/a.md', '원문!', { expectedMtimeMs: 1, expectedRaw: '\ufeff원문', eol: '\r\n', bom: true })
  })
  it('충돌 상태에서는 자동으로 덮어쓰지 않고 명시적 덮어쓰기만 허용한다', async () => {
    await open(); edit(' 내 수정')
    vi.mocked(api.readFile).mockResolvedValue(disk('외부 수정', 3))
    await docs.checkDisk(key)
    expect(useStore.getState().docs[key].status).toBe('conflict')
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.writeFile).not.toHaveBeenCalled()
    expect(await docs.flush(key)).toBe(false)
    await docs.overwriteDisk(key)
    expect(api.writeFile).toHaveBeenLastCalledWith('/notes/a.md', '원문 내 수정', { eol: '\r\n', bom: true, expectedMtimeMs: null })
  })
  it('저장 시 발견한 충돌과 사라진 파일도 자동 재생성하지 않는다', async () => {
    await open(); edit('!')
    vi.mocked(api.writeFile).mockResolvedValue({ ok: false, reason: 'conflict' })
    vi.mocked(api.readFile).mockResolvedValue({ ok: false, reason: 'missing' })
    expect(await docs.flush(key)).toBe(false)
    expect(useStore.getState().docs[key].status).toBe('missing')
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.writeFile).toHaveBeenCalledTimes(1)
  })
  it('저장 도중 추가 입력도 종료 flush에 포함한다', async () => {
    await open(); edit('1')
    let finish!: (value: { ok: true; mtimeMs: number }) => void
    vi.mocked(api.writeFile).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const flushing = docs.flush(key)
    await tick(); edit('2'); finish({ ok: true, mtimeMs: 2 })
    expect(await flushing).toBe(true)
    expect(api.writeFile).toHaveBeenLastCalledWith('/notes/a.md', '원문12', expect.objectContaining({ expectedMtimeMs: 2 }))
  })
  it('읽는 동안 입력한 변경은 디스크 내용에 덮이지 않는다', async () => {
    await open()
    let finish!: (res: ReadResult) => void
    vi.mocked(api.readFile).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const checking = docs.checkDisk(key)
    edit(' 내 변경')
    finish(disk('외부 변경', 4)); await checking
    expect(docs.contentOf(key)).toBe('원문 내 변경')
    expect(useStore.getState().docs[key].status).toBe('conflict')
  })
  it('내 변경이 없는 외부 변경은 뷰에 반영하며 CRLF/BOM을 유지한다', async () => {
    await open()
    const view: docs.DocView = { getDoc: () => Text.of(['원문']), applyRemote() {}, replaceContent: vi.fn() }
    docs.attach(key, view)
    vi.mocked(api.readFile).mockResolvedValue(disk('새 내용', 4))
    await docs.checkDisk(key)
    expect(view.replaceContent).toHaveBeenCalledWith('새 내용')
    expect(useStore.getState().docs[key].dirty).toBe(false)
    expect(docs.formatOf(key)).toEqual({ eol: '\r\n', bom: true })
  })
  it('불러오는 중 닫힌 문서는 늦은 읽기 결과로 되살아나지 않는다', async () => {
    let finish!: (res: ReadResult) => void
    vi.mocked(api.readFile).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    docs.open({ type: 'file', path: '/notes/a.md' })
    await docs.discard(key); finish(disk('늦은 결과')); await tick()
    expect(docs.has(key)).toBe(false)
    expect(useStore.getState().docs[key]).toBeUndefined()
  })
  it('임시 메모의 종류를 바꾸면 본문이 같아도 메타데이터를 저장한다', async () => {
    vi.mocked(api.scratchRead).mockResolvedValue('임시')
    docs.open({ type: 'scratch', id: 's' }); await tick()
    docs.setScratchKind(docKey({ type: 'scratch', id: 's' }), 'md')
    await tick()
    expect(api.scratchWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 's', kind: 'md' }), '임시')
  })
})

describe('데이터 안전성 회귀', () => {
  it('변경 버리기를 승인한 문서는 정리하면서 다시 저장하지 않는다', async () => {
    await open(); edit(' 버릴 변경')
    vi.mocked(api.writeFile).mockResolvedValueOnce({ ok: false, reason: 'error', message: '디스크 오류' })
    expect(await docs.flush(key)).toBe(false)
    docs.allowDiscard(key)
    await docs.collect()
    expect(api.writeFile).toHaveBeenCalledTimes(1)
    expect(docs.has(key)).toBe(false)
  })
  it('디스크 불러오기 도중 추가 입력은 버리기 동의에 포함되지 않는다', async () => {
    await open(); edit(' 기존 수정')
    let finish!: (res: ReadResult) => void
    vi.mocked(api.readFile).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const reload = docs.reloadFromDisk(key)
    edit(' 읽는 동안 새 입력')
    finish(disk('외부 내용', 4))
    expect(await reload).toBe(false)
    expect(docs.contentOf(key)).toBe('원문 기존 수정 읽는 동안 새 입력')
    expect(useStore.getState().docs[key].dirty).toBe(true)
  })
})
