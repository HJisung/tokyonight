import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import {
  Annotation,
  type ChangeSet,
  Compartment,
  EditorState,
  type Extension,
  type Text,
  Transaction,
  type TransactionSpec
} from '@codemirror/state'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { EMPTY_TABLE } from '../shared/table'
import { diffRange } from '../shared/text'
import type { DocKind, EditMode } from '../shared/types'
import './editor.css'
import { livePreview } from './live'
import { baseHighlight, markdownSupport, sourceHighlight } from './markdown'
import { focusTableAt, tableSupport } from './table'

export interface EditorOptions {
  parent: HTMLElement
  doc: Text | string
  kind: DocKind
  mode: EditMode // md일 때만 의미가 있다. txt는 항상 일반 텍스트
  /** 사용자가 이 뷰에서 만든 변경(원격 반영 제외)마다 호출 */
  onLocalChange(changes: ChangeSet, view: EditorView): void
  onFocus(): void
  onOpenLink(url: string): void
}

export interface EditorHandle {
  view: EditorView
  setMode(mode: EditMode): void // 뷰를 다시 만들지 않고 전환 (undo 기록 유지)
  destroy(): void
}

/** 다른 뷰나 디스크에서 온 변경 표시. onLocalChange를 부르지 않는다. */
const remote = Annotation.define<boolean>()

function modeClass(name: string): Extension {
  return EditorView.editorAttributes.of({ class: name })
}

function modeExtensions(kind: DocKind, mode: EditMode, onOpenLink: (url: string) => void): Extension {
  if (kind !== 'md') return modeClass('cm-tn-plain')
  if (mode === 'source') return [modeClass('cm-tn-source'), sourceHighlight]
  return [modeClass('cm-tn-live'), tableSupport(), livePreview({ onOpenLink })]
}

export function createEditor(opts: EditorOptions): EditorHandle {
  const modeSlot = new Compartment()
  let mode = opts.mode

  const state = EditorState.create({
    doc: opts.doc,
    extensions: [
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      search({ top: true }),
      opts.kind === 'md' ? [markdownSupport(), baseHighlight] : [],
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.editorAttributes.of({ class: 'cm-tn' }),
      modeSlot.of(modeExtensions(opts.kind, mode, opts.onOpenLink)),
      EditorView.updateListener.of((update) => {
        for (const tr of update.transactions) {
          if (tr.docChanged && !tr.annotation(remote)) opts.onLocalChange(tr.changes, update.view)
        }
      })
    ]
  })

  const view = new EditorView({ state, parent: opts.parent })
  // 표 칸처럼 편집기 안의 다른 편집 영역에 포커스가 가도 알린다.
  const onFocusIn = () => opts.onFocus()
  view.dom.addEventListener('focusin', onFocusIn)

  return {
    view,
    setMode(next) {
      if (opts.kind !== 'md' || next === mode) return
      mode = next
      view.dispatch({ effects: modeSlot.reconfigure(modeExtensions(opts.kind, mode, opts.onOpenLink)) })
    },
    destroy() {
      view.dom.removeEventListener('focusin', onFocusIn)
      view.destroy()
    }
  }
}

/** 다른 뷰의 변경을 반영. onLocalChange를 부르지 않고 undo 기록에도 넣지 않는다 */
export function applyRemote(view: EditorView, changes: ChangeSet): void {
  view.dispatch({
    changes,
    annotations: [remote.of(true), Transaction.remote.of(true), Transaction.addToHistory.of(false)]
  })
}

/** 디스크 내용으로 교체. diffRange로 달라진 구간만 바꿔 커서를 유지. applyRemote와 같은 취급 */
export function replaceContent(view: EditorView, content: string): void {
  const diff = diffRange(view.state.doc.toString(), content)
  if (!diff) return
  applyRemote(view, view.state.changes(diff))
}

/** revealLine이 고를 선택 범위. 줄 번호는 문서 범위로 맞춘다. */
export function lineTarget(doc: Text, line: number, query?: string): { anchor: number; head: number } {
  const n = Math.min(Math.max(1, Math.floor(line) || 1), doc.lines)
  const l = doc.line(n)
  if (query) {
    const at = l.text.toLowerCase().indexOf(query.toLowerCase())
    if (at >= 0) return { anchor: l.from + at, head: l.from + at + query.length }
  }
  return { anchor: l.from, head: l.from }
}

/** 1부터 세는 줄로 이동·스크롤. query가 있으면 그 줄에서 찾아 선택 */
export function revealLine(view: EditorView, line: number, query?: string): void {
  const selection = lineTarget(view.state.doc, line, query)
  view.dispatch({
    selection,
    effects: EditorView.scrollIntoView(selection.anchor, { y: 'center' })
  })
  view.focus()
}

/**
 * 커서가 있는 줄(비어 있으면 그 줄, 아니면 다음 줄)에 빈 표를 넣는 변경.
 * 표가 문단에 붙지 않도록 앞뒤에 빈 줄을 둔다. tableFrom은 넣은 표의 시작 위치.
 */
export function tableInsertion(state: EditorState): { spec: TransactionSpec; tableFrom: number } {
  const doc = state.doc
  const line = doc.lineAt(state.selection.main.head)
  const blank = (n: number) => n < 1 || n > doc.lines || doc.line(n).text.trim() === ''
  const onEmpty = line.text.trim() === ''
  const at = onEmpty ? line.from : line.to
  let before = ''
  if (!onEmpty) before = '\n\n'
  else if (!blank(line.number - 1)) before = '\n'
  const table = EMPTY_TABLE.replace(/\n$/, '')
  // 표 다음 줄이 없거나 비어 있지 않으면 빈 줄을 하나 만든다(커서가 갈 자리).
  const hasNext = line.number < doc.lines
  const after = !hasNext || !blank(line.number + 1) ? '\n' : ''
  const tableFrom = at + before.length
  return {
    spec: {
      changes: { from: at, insert: before + table + after },
      selection: { anchor: tableFrom + table.length + 1 },
      userEvent: 'input.table',
      scrollIntoView: true
    },
    tableFrom
  }
}

export function insertTable(view: EditorView): void {
  const { spec, tableFrom } = tableInsertion(view.state)
  view.dispatch(spec)
  // 서식 보기라면 위젯이 그려진 뒤 첫 칸으로 들어간다. 원문·txt에서는 해당 위젯이 없어 아무 일도 없다.
  setTimeout(() => {
    if (view.dom.isConnected) focusTableAt(view, tableFrom)
  }, 0)
  view.focus()
}

export function runUndo(view: EditorView): void {
  undo(view)
}

export function runRedo(view: EditorView): void {
  redo(view)
}
