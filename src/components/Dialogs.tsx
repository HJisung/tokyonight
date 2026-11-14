import { useEffect, useRef, useState } from 'react'
import { dismissToast, useStore, type Modal } from '../store'

function Dialog({ modal }: { modal: Modal }) {
  const [value, setValue] = useState(modal.type === 'prompt' ? modal.initial : '')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    if (input.current) {
      input.current.focus()
      input.current.setSelectionRange(0, modal.type === 'prompt' ? modal.selectEnd ?? value.length : 0)
    } else box.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
    // 각 모달의 최초 포커스만 설정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal.id])
  async function submit() {
    if (modal.type !== 'prompt' || pending) return
    setPending(true)
    try {
      const message = await modal.submit(value)
      if (message) setError(message)
      else modal.resolve(value)
    } catch (e) { setError(String(e)) }
    finally { setPending(false) }
  }
  return <div className="modal-backdrop" onPointerDown={(e) => { if (!pending && e.target === e.currentTarget) modal.resolve(null) }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`modal-title-${modal.id}`} aria-describedby={`modal-message-${modal.id}`} ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); if (!pending) modal.resolve(null) }
        if (e.key === 'Tab') {
          const targets = box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
          if (!targets?.length) return
          const first = targets[0], last = targets[targets.length - 1]
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
          if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        }
      }}>
      <h2 id={`modal-title-${modal.id}`}>{modal.title}</h2>
      <div id={`modal-message-${modal.id}`}>
        {modal.type === 'confirm' ? <><p>{modal.message}</p>{modal.details && <ul>{modal.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}</> :
          <form id={`prompt-${modal.id}`} onSubmit={(e) => { e.preventDefault(); void submit() }}>
            <label>{modal.label ?? '이름'}<input ref={input} value={value} disabled={pending} onChange={(e) => { setValue(e.target.value); setError('') }} aria-invalid={!!error} /></label>
            {error && <p className="error-text" role="alert">{error}</p>}
          </form>}
      </div>
      <div className="modal-buttons">{modal.type === 'confirm' ? modal.buttons.map((button) =>
        <button key={button.id} className={button.kind ?? ''} onClick={() => modal.resolve(button.id)}>{button.label}</button>) : <>
          <button disabled={pending} onClick={() => modal.resolve(null)}>취소</button>
          <button className="primary" disabled={pending} type="submit" form={`prompt-${modal.id}`}>{pending ? '처리 중…' : modal.okLabel ?? '확인'}</button>
        </>}</div>
    </div>
  </div>
}

export function Dialogs() {
  const modal = useStore((s) => s.modals.at(-1))
  return modal ? <Dialog key={modal.id} modal={modal} /> : null
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return <div className="toasts" aria-live="polite">{toasts.map((t) => <div className={`toast ${t.kind}`} key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}>
    <span>{t.text}</span><button aria-label="알림 닫기" onClick={() => dismissToast(t.id)}>×</button>
  </div>)}</div>
}
