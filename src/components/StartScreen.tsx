import { deleteScratch, newScratch, openDocument, openFiles, openFolder, perform } from '../actions'
import { basename } from '../shared/paths'
import { useStore } from '../store'
import { Icon } from './Icon'

export function ScratchList() {
  const scratches = useStore((s) => s.scratches)
  return <>{!scratches.length ? <p className="muted empty-small">보관 중인 메모가 없습니다.</p> : <ul className="scratch-list">{scratches.map((m) =>
    <li key={m.id}><button className="scratch-open" title={m.title} onClick={() => perform(() => openDocument({ type: 'scratch', id: m.id }))}>
      <span className="file-kind">{m.kind.toUpperCase()}</span><span className="ellipsis">{m.title}</span>
    </button><button className="subtle" aria-label={`${m.title} 삭제`} onClick={() => perform(() => deleteScratch(m.id))}><Icon name="close" size={14} /></button></li>)}</ul>}</>
}

export function StartScreen() {
  const recent = useStore((s) => s.recent)
  return <main className="start-screen"><div className="start-content">
    <div className="brand-mark" aria-hidden="true"><Icon name="moon" size={26} /></div><p className="eyebrow">TOKYONIGHT</p>
    <h1>생각이 머무는 자리</h1><p className="start-description">가볍게 메모하고, 문서를 나란히 펼쳐 보세요.</p>
    <div className="start-actions">
      <button className="primary" onClick={() => perform(newScratch)}>＋ 새 임시 메모</button>
      <button onClick={() => perform(() => openFolder())}>폴더 열기</button>
      <button onClick={() => perform(openFiles)}>파일 열기</button>
    </div>
    <div className="start-lists"><section><h2>최근 폴더</h2>{!recent.length ? <p className="muted">최근에 연 폴더가 없습니다.</p> :
      <ul className="recent-list">{recent.map((path) => <li key={path}><button onClick={() => perform(() => openFolder(path))}><strong>{basename(path)}</strong><span>{path}</span></button></li>)}</ul>}</section>
      <section><h2>보관 중인 임시 메모</h2><ScratchList /></section></div>
    <p className="start-footnote">계정 없이, 내 컴퓨터에. 문서는 입력 후 자동으로 저장됩니다.</p>
  </div></main>
}
