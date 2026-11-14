import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import type { EditorHandle } from '../editor'
import { applyRemote, createEditor, replaceContent, revealLine } from '../editor'
import * as docs from '../docs'
import { api } from '../api'
import { closePane, newScratch, openFiles, perform, resolveConflict, splitPane } from '../actions'
import { docKey, titleOfRef, useStore } from '../store'
import type { LayoutNode, Leaf, Split } from '../shared/types'
import { Icon } from './Icon'

interface MountedEditor {
  key: string
  kind: 'md' | 'txt'
  handle: EditorHandle
  adapter: docs.DocView
  mount: HTMLDivElement
  owner: object
}

// React 배치 트리의 부모가 달라져도 같은 leaf의 CM 인스턴스를 재사용한다.
// 같은 커밋 안의 unmount/mount는 소유권을 넘기고, 실제로 닫힌 뷰만 microtask에서 정리한다.
const editors = new Map<string, MountedEditor>()

function destroyEditor(leafId: string, editor: MountedEditor) {
  if (editors.get(leafId) === editor) editors.delete(leafId)
  docs.detach(editor.key, editor.adapter)
  if (docs.leafViews.get(leafId) === editor.handle.view) docs.leafViews.delete(leafId)
  editor.handle.destroy()
  editor.mount.remove()
}

function Editor({ leaf, wsId, kind }: { leaf: Leaf; wsId: string; kind: 'md' | 'txt' }) {
  const parent = useRef<HTMLDivElement>(null)
  const handle = useRef<EditorHandle | null>(null)
  const key = docKey(leaf.doc!)
  const mode = useRef(leaf.mode)
  mode.current = leaf.mode
  useLayoutEffect(() => {
    const text = docs.textOf(key)
    if (!parent.current || text === null) return
    let entry = editors.get(leaf.id)
    if (entry && (entry.key !== key || entry.kind !== kind)) {
      destroyEditor(leaf.id, entry)
      entry = undefined
    }
    const owner = {}
    if (!entry) {
      const mount = document.createElement('div')
      mount.className = 'editor-mount'
      // 생성 직후 문서가 바뀌지는 않는다. 문서/종류가 바뀌면 위에서 새로 만든다.
      const adapter: docs.DocView = {
        getDoc: () => editor.view.state.doc,
        applyRemote: (changes) => applyRemote(editor.view, changes),
        replaceContent: (content) => replaceContent(editor.view, content)
      }
      const editor = createEditor({ parent: mount, doc: text, kind, mode: mode.current,
        onLocalChange: (changes) => docs.localChange(key, adapter, changes),
        onFocus: () => useStore.getState().activateLeaf(wsId, leaf.id),
        onOpenLink: (url) => api.openExternal(url) })
      entry = { key, kind, handle: editor, adapter, mount, owner }
      editors.set(leaf.id, entry)
      docs.attach(key, adapter)
      docs.leafViews.set(leaf.id, editor.view)
    }
    const cached = entry
    cached.owner = owner
    parent.current.appendChild(cached.mount)
    handle.current = cached.handle
    cached.handle.view.requestMeasure()
    return () => {
      handle.current = null
      queueMicrotask(() => {
        if (cached.owner === owner && editors.get(leaf.id) === cached) destroyEditor(leaf.id, cached)
      })
    }
  }, [key, kind, wsId, leaf.id])
  useEffect(() => { handle.current?.setMode(leaf.mode) }, [leaf.mode])
  const reveal = useStore((s) => s.reveal)
  useEffect(() => {
    if (reveal?.leafId === leaf.id && handle.current) {
      revealLine(handle.current.view, reveal.line, reveal.query)
      handle.current.view.focus()
      if (useStore.getState().reveal === reveal) useStore.setState({ reveal: null })
    }
  }, [reveal, key, leaf.id])
  return <div className="editor-host" ref={parent} />
}

function Pane({ leaf, wsId, active }: { leaf: Leaf; wsId: string; active: boolean }) {
  const key = leaf.doc ? docKey(leaf.doc) : ''
  const info = useStore((s) => s.docs[key])
  const scratches = useStore((s) => s.scratches)
  const title = leaf.doc ? titleOfRef(leaf.doc, scratches) : '빈 영역'
  useEffect(() => { if (leaf.doc) docs.open(leaf.doc) }, [key])
  const focus = () => useStore.getState().activateLeaf(wsId, leaf.id)
  const split = (dir: Split['dir']) => { focus(); splitPane(dir) }
  return <section className={`pane ${active ? 'active' : ''}`} aria-label={title} onPointerDownCapture={focus} onFocusCapture={focus}>
    <header className="pane-header"><span className="document-icon"><Icon name={info?.kind === 'md' ? 'markdown' : 'file'} size={15} /></span><span className="pane-title ellipsis" title={leaf.doc?.type === 'file' ? leaf.doc.path : title}>{title}</span>
      {info && <span className={`save-state ${info.dirty ? 'dirty' : ''}`} title={info.saveError ?? info.reason ?? ''}>{
        info.status === 'loading' ? '불러오는 중' : info.status === 'conflict' ? '충돌' : info.status === 'missing' ? '사라짐' : info.status === 'error' ? '읽기 오류' : info.saveError ? '저장 실패' : info.saving ? '저장 중…' : info.dirty ? '변경됨' : '저장됨'
      }</span>}
      <div className="pane-tools">
        {leaf.doc?.type === 'scratch' && info && <button title="임시 메모 형식 변경" onClick={() => docs.setScratchKind(key, info.kind === 'txt' ? 'md' : 'txt')}>{info.kind.toUpperCase()}</button>}
        {info?.kind === 'md' && <button title="서식 보기 / 원문 전환" aria-pressed={leaf.mode === 'source'} onClick={() => useStore.getState().setLeafMode(wsId, leaf.id, leaf.mode === 'live' ? 'source' : 'live')}>{leaf.mode === 'live' ? '원문' : '서식'}</button>}
        <button title="좌우 분할" aria-label="좌우 분할" onClick={() => split('row')}><Icon name="splitRight" size={15} /></button>
        <button title="상하 분할" aria-label="상하 분할" onClick={() => split('column')}><Icon name="splitDown" size={15} /></button>
        <button title="영역 닫기" aria-label={`${title} 영역 닫기`} onClick={() => perform(() => closePane(wsId, leaf.id))}><Icon name="close" size={15} /></button>
      </div>
    </header>
    {info && (info.status === 'conflict' || info.status === 'missing' || info.status === 'error' || info.saveError) && <div className="doc-banner" role="status">
      <p>{info.status === 'conflict' ? '외부 변경과 충돌했습니다. 자동 저장을 멈췄습니다.' : info.status === 'missing' ? '원래 위치에 파일이 없습니다. 자동 저장을 멈췄습니다.' : info.status === 'error' ? info.reason : `저장하지 못했습니다: ${info.saveError}`}</p>
      {info.reason && info.status === 'conflict' && <p>{info.reason}</p>}
      <div>{info.hasText && leaf.doc?.type === 'file' && (info.status === 'conflict' || info.status === 'missing') ? <>
        <button onClick={() => perform(() => resolveConflict(key, 'reload'))}>디스크 내용 불러오기</button>
        <button className="danger" onClick={() => perform(() => resolveConflict(key, 'overwrite'))}>{info.status === 'missing' ? '내 내용으로 다시 만들기' : '내 내용으로 덮어쓰기'}</button>
      </> : <button onClick={() => info.saveError ? docs.retrySave(key) : docs.retryLoad(key)}>다시 시도</button>}</div>
    </div>}
    {leaf.doc ? info?.hasText ? <Editor leaf={leaf} wsId={wsId} kind={info.kind} /> : <div className="pane-empty muted">{info?.status === 'loading' || !info ? '문서를 불러오는 중…' : '문서를 불러올 수 없습니다.'}</div> :
      <div className="pane-empty"><span className="empty-symbol" aria-hidden="true"><Icon name="note" size={30} /></span><h2>여기서 시작하세요</h2><p>왼쪽에서 문서를 선택하거나 새 메모를 만드세요.</p><div>
        <button className="primary" onClick={() => perform(newScratch)}>새 임시 메모</button><button onClick={() => perform(openFiles)}>파일 열기</button>
      </div></div>}
  </section>
}

/** 인접한 두 영역의 합계를 유지하며 드래그와 키보드로 크기를 조절한다. */
function Divider({ node, index, wsId }: { node: Split; index: number; wsId: string }) {
  const gesture = useRef<{ start: number; sizes: number[]; extent: number } | null>(null)
  const row = node.dir === 'row'
  function resize(delta: number, sizes = node.sizes) {
    const next = sizes.slice(), total = next[index] + next[index + 1]
    const min = Math.min(0.08, total / 3)
    next[index] = Math.max(min, Math.min(total - min, sizes[index] + delta))
    next[index + 1] = total - next[index]
    useStore.getState().resizeSplit(wsId, node.id, next)
  }
  return <div role="separator" tabIndex={0} aria-label="분할 영역 크기" aria-orientation={row ? 'vertical' : 'horizontal'}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(node.sizes[index] * 100)} className={`divider ${row ? 'vertical' : 'horizontal'}`}
    onPointerDown={(e) => {
      if (e.button !== 0) return
      const rect = e.currentTarget.parentElement!.getBoundingClientRect()
      gesture.current = { start: row ? e.clientX : e.clientY, sizes: node.sizes.slice(), extent: row ? rect.width : rect.height }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
    }} onPointerMove={(e) => {
      const g = gesture.current
      if (g && g.extent > 0) resize(((row ? e.clientX : e.clientY) - g.start) / g.extent, g.sizes)
    }} onPointerUp={(e) => { gesture.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }}
    onPointerCancel={() => { gesture.current = null }} onLostPointerCapture={() => { gesture.current = null }}
    onKeyDown={(e) => {
      if (e.key === (row ? 'ArrowRight' : 'ArrowDown')) { e.preventDefault(); resize(0.025) }
      if (e.key === (row ? 'ArrowLeft' : 'ArrowUp')) { e.preventDefault(); resize(-0.025) }
    }} />
}

export function minimumLayoutSize(node: LayoutNode): { width: number; height: number } {
  if (node.type === 'leaf') return { width: 240, height: 180 }
  const children = node.children.map(minimumLayoutSize)
  return node.dir === 'row'
    ? { width: children.reduce((n, c) => n + c.width, 0) + (children.length - 1) * 4, height: Math.max(...children.map((c) => c.height)) }
    : { width: Math.max(...children.map((c) => c.width)), height: children.reduce((n, c) => n + c.height, 0) + (children.length - 1) * 4 }
}

export function Panes({ node, wsId, activeLeaf }: { node: LayoutNode; wsId: string; activeLeaf: string }) {
  if (node.type === 'leaf') return <Pane leaf={node} wsId={wsId} active={activeLeaf === node.id} />
  return <div className={`split split-${node.dir}`}>{node.children.map((child, i) => <Fragment key={child.id}>
    {i > 0 && <Divider node={node} index={i - 1} wsId={wsId} />}
    <div className="split-child" style={{ flexGrow: node.sizes[i], minWidth: minimumLayoutSize(child).width, minHeight: minimumLayoutSize(child).height }}><Panes node={child} wsId={wsId} activeLeaf={activeLeaf} /></div>
  </Fragment>)}</div>
}
