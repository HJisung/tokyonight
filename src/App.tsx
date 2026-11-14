import { useEffect } from 'react'
import { api, isMac } from './api'
import * as docs from './docs'
import { copyDropped, handleMenu, initialize, newScratch, openFiles, openFolder, perform, prepareClose, refreshTree, showStart, startSessionPersistence } from './actions'
import { isInside } from './shared/paths'
import { allLeaves, useStore, withBusy } from './store'
import { Dialogs, Toasts } from './components/Dialogs'
import { minimumLayoutSize, Panes } from './components/Panes'
import { Sidebar } from './components/Sidebar'
import { StartScreen } from './components/StartScreen'
import { WorkspaceTabs } from './components/WorkspaceTabs'
import { Icon } from './components/Icon'

let startup: Promise<void> | null = null
let closeInProgress = false

export function App() {
  const screen = useStore((s) => s.screen), folder = useStore((s) => s.folder)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const workspaces = useStore((s) => s.workspaces), active = useStore((s) => s.activeWorkspace), visited = useStore((s) => s.visited)
  const busy = useStore((s) => s.busy), hasModal = useStore((s) => s.modals.length > 0)
  useEffect(() => {
    let disposed = false
    const cleanup: (() => void)[] = [startSessionPersistence(), docs.startDocSync()]
    function register(subscription: Promise<() => void>) {
      subscription.then((stop) => { if (disposed) stop(); else cleanup.push(stop) }).catch((e) => perform(() => { throw e }))
    }
    startup ??= withBusy(initialize)
    void startup
    register(api.onMenu((cmd) => perform(() => handleMenu(cmd))))
    register(api.onChanged((paths) => { docs.checkPaths(paths); perform(refreshTree) }))
    const focus = () => { docs.checkAll(); perform(refreshTree) }
    window.addEventListener('focus', focus)
    cleanup.push(() => window.removeEventListener('focus', focus))
    register(api.onCloseRequested((event) => {
      event.preventDefault()
      if (closeInProgress || useStore.getState().busy || useStore.getState().modals.length) return
      closeInProgress = true
      perform(() => withBusy(async () => {
        try { if (await prepareClose()) await api.closeWindow() }
        finally { closeInProgress = false }
      }))
    }))
    register(api.onDragDrop((event) => {
      if (event.type === 'leave') { useStore.setState({ dropTarget: null }); return }
      const s = useStore.getState()
      if (!s.folder || s.busy || s.modals.length) return
      const element = document.elementFromPoint(event.x ?? 0, event.y ?? 0)
      // 편집기에 놓으면 파일을 복사하지 않는다. 사이드바의 빈 곳은 루트다.
      if (!element?.closest('.sidebar')) { useStore.setState({ dropTarget: null }); return }
      const dir = element.closest<HTMLElement>('[data-drop-dir]')?.dataset.dropDir ?? s.folder
      useStore.setState({ dropTarget: event.type === 'over' ? dir : null })
      if (event.type === 'drop') perform(() => copyDropped(event.paths ?? [], dir))
    }))
    return () => { disposed = true; cleanup.forEach((stop) => stop()) }
  }, [])
  const watchedPaths = JSON.stringify([...new Set(allLeaves(workspaces).flatMap((leaf) => leaf.doc?.type === 'file' && (!folder || !isInside(leaf.doc.path, folder)) ? [leaf.doc.path] : []))].sort())
  useEffect(() => { void api.watchFiles(JSON.parse(watchedPaths) as string[]) }, [watchedPaths])
  return <>
    <div className={`app ${isMac ? 'platform-mac' : ''}`} inert={busy > 0 || hasModal} aria-busy={busy > 0}>
      <header className="titlebar" data-tauri-drag-region>
        <div className="window-tools">{screen === 'session' ? <button className="icon-button" title={sidebarOpen ? '사이드바 숨기기' : '사이드바 표시'} aria-label={sidebarOpen ? '사이드바 숨기기' : '사이드바 표시'} onClick={() => useStore.setState({ sidebarOpen: !sidebarOpen })}><Icon name="sidebar" /></button> : <span className="app-name" data-tauri-drag-region><Icon name="moon" />TokyoNight</span>}</div>
        {screen === 'session' ? <WorkspaceTabs /> : <div className="titlebar-space" data-tauri-drag-region />}
        <div className="titlebar-actions">
          <button className="icon-button" title="새 임시 메모" aria-label="새 임시 메모" onClick={() => perform(newScratch)}><Icon name="note" /></button>
          <button className="icon-button" title="폴더 열기" aria-label="폴더 열기" onClick={() => perform(() => openFolder())}><Icon name="folder" /></button>
          <button className="icon-button" title="파일 열기" aria-label="파일 열기" onClick={() => perform(openFiles)}><Icon name="file" /></button>
          {screen === 'session' && <><span className="toolbar-separator" /><button className="icon-button" title="시작 화면으로" aria-label="시작 화면으로" onClick={() => perform(showStart)}><Icon name="home" /></button></>}
        </div>
      </header>
      {screen === 'loading' ? <main className="loading" role="status">작업을 불러오는 중…</main> : screen === 'start' ? <StartScreen /> : <>
        <div className="session-body">{sidebarOpen && <Sidebar />}<main className="workspace-area">
          {workspaces.filter((w) => visited.includes(w.id)).map((w) => <div key={w.id} id={`workspace-${w.id}`} className="workspace" style={{ minWidth: minimumLayoutSize(w.layout).width, minHeight: minimumLayoutSize(w.layout).height }} role="tabpanel" aria-labelledby={`tab-${w.id}`} hidden={w.id !== active}>
            <Panes node={w.layout} wsId={w.id} activeLeaf={w.activeLeaf} />
          </div>)}
        </main></div><footer className="statusbar"><span className="ellipsis">{folder ?? '폴더 없는 세션'}</span><span>로컬 저장 · UTF-8</span></footer>
      </>}
    </div>
    {busy > 0 && !hasModal && <div className="busy-overlay" role="status" aria-live="polite"><span>작업을 마무리하는 중…</span></div>}
    <Dialogs /><Toasts />
  </>
}
