import { deleteWorkspace, perform, renameWorkspace } from '../actions'
import { useStore } from '../store'
import { Icon } from './Icon'

export function WorkspaceTabs() {
  const workspaces = useStore((s) => s.workspaces)
  const active = useStore((s) => s.activeWorkspace)
  return <nav className="workspace-tabs" aria-label="워크스페이스" data-tauri-drag-region>
    <div role="tablist" aria-label="작업 화면">{workspaces.map((w) => <div className={`workspace-tab ${w.id === active ? 'selected' : ''}`} key={w.id}>
      <button role="tab" id={`tab-${w.id}`} aria-selected={w.id === active} aria-controls={`workspace-${w.id}`} onClick={() => useStore.getState().switchWorkspace(w.id)}
        onDoubleClick={() => perform(() => renameWorkspace(w.id))} onKeyDown={(e) => {
          if (e.key === 'F2') { e.preventDefault(); perform(() => renameWorkspace(w.id)) }
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            const index = workspaces.findIndex((v) => v.id === w.id)
            const next = workspaces[(index + (e.key === 'ArrowRight' ? 1 : workspaces.length - 1)) % workspaces.length]
            useStore.getState().switchWorkspace(next.id)
            document.getElementById(`tab-${next.id}`)?.focus()
          }
        }} title="두 번 클릭하여 이름 변경"><span className="workspace-indicator" />{w.name}</button>
      <button className="tab-rename" aria-label={`${w.name} 이름 변경`} onClick={() => perform(() => renameWorkspace(w.id))}><Icon name="more" size={14} /></button>
      {workspaces.length > 1 && <button aria-label={`${w.name} 워크스페이스 닫기`} onClick={() => perform(() => deleteWorkspace(w.id))}><Icon name="close" size={13} /></button>}
    </div>)}</div><button className="add-workspace" aria-label="워크스페이스 추가" onClick={() => useStore.getState().addWorkspace()}><Icon name="plus" size={16} /></button>
  </nav>
}
