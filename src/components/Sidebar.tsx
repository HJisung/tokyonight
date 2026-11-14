import { useEffect, useRef, useState } from 'react'
import { api, isMac } from '../api'
import { createEntry, newScratch, openDocument, perform, refreshTree, renameEntry, toggleDirectory, trashEntry } from '../actions'
import { basename, dirname } from '../shared/paths'
import { isSupported } from '../shared/text'
import type { DirEntry, SearchResult } from '../shared/types'
import { activeLeafOf, useStore } from '../store'
import { ScratchList } from './StartScreen'
import { Icon } from './Icon'

interface MenuState { entry: DirEntry; x: number; y: number }

function ContextMenu({ menu, close }: { menu: MenuState; close: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    box.current?.querySelector('button')?.focus()
    const cancel = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close() }
    document.addEventListener('pointerdown', cancel)
    return () => { document.removeEventListener('pointerdown', cancel); previous?.isConnected && previous.focus() }
  }, [close])
  const rootFolder = useStore((s) => s.folder)
  const { entry } = menu
  const dir = entry.isDir ? entry.path : dirname(entry.path)
  const run = (work: () => void | Promise<unknown>) => { close(); perform(work) }
  return <div role="menu" aria-label={`${entry.name} 작업`} className="context-menu" ref={box}
    style={{ left: Math.max(4, Math.min(menu.x, window.innerWidth - 224)), top: Math.max(4, Math.min(menu.y, window.innerHeight - 300)) }}
    onKeyDown={(e) => {
      if (e.key === 'Escape') { e.preventDefault(); close() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(at + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus()
      }
    }}>
    {!entry.isDir && <button role="menuitem" disabled={!isSupported(entry.name)} onClick={() => run(() => openDocument({ type: 'file', path: entry.path }, true))}>오른쪽 분할로 열기</button>}
    <button role="menuitem" onClick={() => run(() => createEntry(dir, 'md'))}>새 Markdown 파일</button>
    <button role="menuitem" onClick={() => run(() => createEntry(dir, 'txt'))}>새 텍스트 파일</button>
    <button role="menuitem" onClick={() => run(() => createEntry(dir, 'folder'))}>새 폴더</button>
    <hr />{entry.path !== rootFolder && <button role="menuitem" onClick={() => run(() => renameEntry(entry.path))}>이름 변경</button>}
    <button role="menuitem" onClick={() => run(() => api.reveal(entry.path))}>{isMac ? 'Finder' : '파일 탐색기'}에서 보기</button>
    {entry.path !== rootFolder && <button role="menuitem" className="danger" onClick={() => run(() => trashEntry(entry.path))}>휴지통으로 이동</button>}
  </div>
}

function TreeBranch({ dir, depth, onMenu }: { dir: string; depth: number; onMenu: (menu: MenuState) => void }) {
  const entries = useStore((s) => s.tree[dir])
  const expanded = useStore((s) => s.expanded)
  const target = useStore((s) => s.dropTarget)
  const selectedPath = useStore((s) => { const doc = activeLeafOf(s)?.doc; return doc?.type === 'file' ? doc.path : null })
  if (entries === undefined) return <p className="tree-message">불러오는 중…</p>
  if (entries === null) return <div className="tree-message">폴더를 읽지 못했습니다. <button onClick={() => perform(refreshTree)}>재시도</button></div>
  if (!entries.length) return <p className="tree-message">빈 폴더</p>
  return <ul className="file-tree">{entries.map((entry) => {
    const open = expanded.includes(entry.path)
    const supported = entry.isDir || isSupported(entry.name)
    const dest = entry.isDir ? entry.path : dirname(entry.path)
    return <li key={entry.path}><div className={`tree-row ${!supported ? 'unsupported' : ''} ${selectedPath === entry.path ? 'selected-file' : ''} ${target === entry.path ? 'drop-highlight' : ''}`} data-drop-dir={dest}
      style={{ paddingLeft: 10 + depth * 14 }}>
      <button className="tree-item" aria-current={selectedPath === entry.path ? 'page' : undefined} aria-expanded={entry.isDir ? open : undefined} aria-disabled={!supported} title={supported ? entry.path : '지원하지 않는 파일 형식'}
        onContextMenu={(e) => { e.preventDefault(); onMenu({ entry, x: e.clientX, y: e.clientY }) }}
        onKeyDown={(e) => {
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); onMenu({ entry, x: rect.left, y: rect.bottom })
          }
          if (entry.isDir && ((e.key === 'ArrowRight' && !open) || (e.key === 'ArrowLeft' && open))) { e.preventDefault(); perform(() => toggleDirectory(entry.path)) }
        }} onClick={() => { if (entry.isDir) perform(() => toggleDirectory(entry.path)); else if (supported) perform(() => openDocument({ type: 'file', path: entry.path })) }}>
        <span className="tree-icon" aria-hidden="true">{entry.isDir ? <Icon name="chevron" size={12} style={{ transform: open ? 'rotate(90deg)' : undefined }} /> : <Icon name={/\.(md|markdown)$/i.test(entry.name) ? 'markdown' : 'file'} size={14} />}</span><span className="ellipsis">{entry.name}</span>
      </button>
      <button className="tree-more" aria-label={`${entry.name} 작업 메뉴`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu({ entry, x: r.left, y: r.bottom }) }}><Icon name="more" size={14} /></button>
    </div>{entry.isDir && open && <TreeBranch dir={entry.path} depth={depth + 1} onMenu={onMenu} />}</li>
  })}</ul>
}

function Search() {
  const folder = useStore((s) => s.folder), focus = useStore((s) => s.searchFocus)
  const tab = useStore((s) => s.sidebarTab)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (tab === 'search') input.current?.focus() }, [focus, tab])
  useEffect(() => {
    let alive = true
    setResult(null); setError(''); setLoading(false)
    if (!folder || !query.trim()) return
    setLoading(true)
    const timer = setTimeout(() => {
      api.search(folder, query.trim()).then((value) => { if (alive) setResult(value) }, (e) => { if (alive) setError(String(e)) })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [folder, query])
  const open = (path: string, line?: number) => perform(() => openDocument({ type: 'file', path }, false, line, query.trim()))
  return <section className="search-panel" aria-label="폴더 검색">
    <label className="sr-only" htmlFor="folder-search">파일 이름과 내용 검색</label>
    <input id="folder-search" ref={input} type="search" placeholder="파일 이름과 내용 검색" value={query} onChange={(e) => setQuery(e.target.value)} disabled={!folder} />
    {!folder && <p className="muted">폴더를 열면 파일 이름과 내용을 검색할 수 있습니다.</p>}
    {loading && <p role="status">검색 중…</p>}{error && <p className="error-text" role="alert">{error}</p>}
    {result && <><h3>파일 <span>{result.files.length}</span></h3><ul className="search-results">{result.files.map((file) => <li key={file.path}><button onClick={() => open(file.path)} title={file.path}>{file.name}</button></li>)}</ul>
      <h3>내용 <span>{result.matches.length}</span></h3><ul className="search-results">{result.matches.map((m, i) => <li key={`${m.path}:${m.line}:${i}`}><button onClick={() => open(m.path, m.line)} title={m.path}>
        <strong>{basename(m.path)} <small>:{m.line}</small></strong><span>{m.text}</span></button></li>)}</ul>
      {!result.files.length && !result.matches.length && <p className="muted">검색 결과가 없습니다.</p>}
      {result.truncated && <p className="muted">결과가 많아 일부만 표시합니다. 검색어를 더 구체적으로 입력하세요.</p>}</>}
  </section>
}

export function Sidebar() {
  const folder = useStore((s) => s.folder), tab = useStore((s) => s.sidebarTab), target = useStore((s) => s.dropTarget)
  const [menu, setMenu] = useState<MenuState | null>(null)
  return <aside className="sidebar" aria-label="문서 탐색">
    <div className="sidebar-tabs"><button aria-pressed={tab === 'files'} onClick={() => useStore.setState({ sidebarTab: 'files' })}><Icon name="folder" size={14} />파일</button><button aria-pressed={tab === 'search'} onClick={() => useStore.setState({ sidebarTab: 'search' })}><Icon name="search" size={14} />검색</button></div>
    <div hidden={tab !== 'files'} className="sidebar-scroll">
      <section className={`folder-section ${target === folder ? 'drop-highlight' : ''}`} data-drop-dir={folder ?? undefined}>
        <header className="section-heading"><h2 title={folder ?? ''}>{folder ? basename(folder) : '폴더 없음'}</h2>{folder && <button title="폴더 작업" aria-label="폴더 작업" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ entry: { path: folder, name: basename(folder), isDir: true }, x: r.left, y: r.bottom }) }}><Icon name="more" size={14} /></button>}</header>
        {folder ? <><div className="file-actions"><button aria-label="새 Markdown 파일" title="새 Markdown 파일" onClick={() => perform(() => createEntry(folder, 'md'))}><Icon name="markdown" size={15} /><span>새 문서</span></button><button aria-label="새 텍스트 파일" title="새 텍스트 파일" onClick={() => perform(() => createEntry(folder, 'txt'))}><Icon name="file" size={15} /></button><button aria-label="새 폴더" title="새 폴더" onClick={() => perform(() => createEntry(folder, 'folder'))}><Icon name="folderPlus" size={15} /></button></div>
          <div aria-label="폴더 파일"><TreeBranch dir={folder} depth={0} onMenu={setMenu} /></div></> : <p className="muted empty-small">임시 메모와 낱개 파일로 작업 중입니다.</p>}
      </section><section className="scratch-section"><header className="section-heading"><h2>임시 메모</h2><button aria-label="새 임시 메모" onClick={() => perform(newScratch)}><Icon name="plus" size={15} /></button></header><ScratchList /></section>
    </div><div hidden={tab !== 'search'} className="sidebar-scroll"><Search /></div>
    {menu && <ContextMenu menu={menu} close={() => setMenu(null)} />}
  </aside>
}
