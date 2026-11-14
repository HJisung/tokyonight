import { beforeEach, describe, expect, it } from 'vitest'
import { leaves, makeLeaf } from '../src/shared/layout'
import { closeLeafIn, defaultSession, docKey, restoreSession, splitLeafIn, useStore } from '../src/store'

beforeEach(() => useStore.setState(useStore.getInitialState(), true))

describe('세션 복원', () => {
  it('잘못된 배치는 기본 빈 영역으로 복원한다', () => {
    const session = restoreSession({ workspaces: [{ id: 'bad', name: '깨짐', layout: { type: 'split' } }] }, new Set())
    expect(session.workspaces).toHaveLength(1)
    expect(leaves(session.workspaces[0].layout)[0].doc).toBeNull()
  })
  it('중복 영역 ID를 가진 작업과 삭제된 임시 메모 참조를 제거한다', () => {
    const base = defaultSession(), ws = base.workspaces[0]
    const leaf = leaves(ws.layout)[0]
    leaf.doc = { type: 'scratch', id: 'gone' }
    const restored = restoreSession({ ...base, workspaces: [ws, { ...ws, id: 'other' }], expanded: ['/x', '/x', 42] }, new Set())
    expect(restored.workspaces).toHaveLength(1)
    expect(leaves(restored.workspaces[0].layout)[0].doc).toBeNull()
    expect(restored.expanded).toEqual(['/x'])
  })
})

describe('워크스페이스와 분할 영역', () => {
  it('방문한 작업과 작업별 배치를 유지한다', () => {
    const session = defaultSession()
    useStore.getState().enterSession(null, session, null)
    const first = session.activeWorkspace
    useStore.getState().addWorkspace()
    const second = useStore.getState().activeWorkspace
    useStore.getState().switchWorkspace(first)
    expect(useStore.getState().visited).toEqual([first, second])
    expect(useStore.getState().workspaces[0].layout).toBe(session.workspaces[0].layout)
  })
  it('활성 영역을 닫으면 이웃으로 이동하고 마지막 영역은 빈 영역으로 남긴다', () => {
    const session = defaultSession(), ws = session.workspaces[0]
    const first = leaves(ws.layout)[0], added = makeLeaf({ type: 'file', path: '/one.md' })
    const split = splitLeafIn(session.workspaces, ws.id, first.id, 'row', added)
    expect(split[0].activeLeaf).toBe(added.id)
    const closed = closeLeafIn(split, ws.id, added.id)
    expect(closed[0].activeLeaf).toBe(first.id)
    const empty = closeLeafIn(closed, ws.id, first.id)
    expect(leaves(empty[0].layout)).toHaveLength(1)
    expect(leaves(empty[0].layout)[0].doc).toBeNull()
    expect(docKey(added.doc!)).toBe('file:/one.md')
  })
})

it('손상된 세션의 상대 경로는 cwd의 엉뚱한 파일을 열지 않도록 비운다', () => {
  const session = defaultSession()
  leaves(session.workspaces[0].layout)[0].doc = { type: 'file', path: '../unrelated.txt' }
  const restored = restoreSession(session, new Set())
  expect(leaves(restored.workspaces[0].layout)[0].doc).toBeNull()
})
