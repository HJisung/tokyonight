import { syntaxTree } from '@codemirror/language'
import { type EditorState, type Extension, type Range, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import {
  addColumn,
  addRow,
  parseTable,
  removeColumn,
  removeRow,
  sanitizeCell,
  serializeTable,
  setCell,
  type TableModel
} from '../shared/table'
import { diffRange } from '../shared/text'

export interface TableInfo {
  from: number
  to: number
  source: string
}

/** 문서 최상위의 표를 찾는다. 인용문·목록 안의 표는 위젯으로 바꾸지 않는다. */
export function findTables(state: EditorState): TableInfo[] {
  const out: TableInfo[] = []
  const doc = state.doc
  const cursor = syntaxTree(state).cursor()
  if (!cursor.firstChild()) return out
  do {
    if (cursor.name !== 'Table') continue
    const from = doc.lineAt(cursor.from).from
    let to = cursor.to
    if (to > from && doc.sliceString(to - 1, to) === '\n') to--
    to = doc.lineAt(to).to
    const source = doc.sliceString(from, to)
    if (parseTable(source)) out.push({ from, to, source })
  } while (cursor.nextSibling())
  return out
}

/** 표 하나를 원문으로 보이게 한다(값: 표 시작 위치). 선택이 표를 벗어나면 다시 위젯이 된다. */
export const showTableSource = StateEffect.define<number>({
  map: (pos, mapping) => mapping.mapPos(pos, -1)
})

interface TableState {
  raw: readonly number[]
  deco: DecorationSet
}

const NO_RAW: readonly number[] = []

function buildTables(state: EditorState, raw: readonly number[]): TableState {
  const decos: Range<Decoration>[] = []
  const kept: number[] = []
  const sel = state.selection.ranges
  for (const t of findTables(state)) {
    const wantsRaw = raw.some((p) => p >= t.from && p <= t.to)
    if (wantsRaw && sel.some((r) => r.from <= t.to && r.to >= t.from)) {
      kept.push(t.from)
      continue
    }
    decos.push(Decoration.replace({ widget: new TableWidget(t.source), block: true }).range(t.from, t.to))
  }
  return { raw: kept.length ? kept : NO_RAW, deco: Decoration.set(decos) }
}

export const tableField = StateField.define<TableState>({
  create: (state) => buildTables(state, NO_RAW),
  update(value, tr) {
    let raw = value.raw
    if (tr.docChanged && raw.length) raw = raw.map((p) => tr.changes.mapPos(p, -1))
    for (const e of tr.effects) if (e.is(showTableSource)) raw = [...raw, e.value]
    const treeChanged = syntaxTree(tr.startState) !== syntaxTree(tr.state)
    if (!tr.docChanged && !treeChanged && raw === value.raw && !(raw.length && tr.selection)) return value
    return buildTables(tr.state, raw)
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.deco),
    EditorView.atomicRanges.of((view) => view.state.field(f, false)?.deco ?? Decoration.none)
  ]
})

export function tableSupport(): Extension {
  return tableField
}

/* ---------- 위젯 ---------- */

interface Live {
  source: string
  /** 마지막으로 포커스가 있던 칸. 머리글 행은 row = -1 */
  row: number
  col: number
  composing: boolean
}

const live = new WeakMap<HTMLElement, Live>()

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text != null) node.textContent = text
  return node
}

function cellText(cell: HTMLElement): string {
  return sanitizeCell(cell.textContent ?? '')
}

function cells(wrap: HTMLElement): HTMLElement[] {
  return Array.from(wrap.querySelectorAll<HTMLElement>('[data-col]'))
}

function findCell(wrap: HTMLElement, row: number, col: number): HTMLElement | null {
  return wrap.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)
}

function focusCell(wrap: HTMLElement, row: number, col: number): void {
  const cell = findCell(wrap, row, col)
  if (!cell) return
  cell.focus()
  const sel = cell.ownerDocument.getSelection()
  if (!sel) return
  const range = cell.ownerDocument.createRange()
  range.selectNodeContents(cell)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

function renderGrid(table: HTMLTableElement, model: TableModel): void {
  table.textContent = ''
  const makeCell = (tag: 'th' | 'td', row: number, col: number, text: string) => {
    const cell = el(tag, 'cm-tn-cell', text)
    cell.setAttribute('contenteditable', 'plaintext-only')
    cell.spellcheck = false
    cell.dataset.row = String(row)
    cell.dataset.col = String(col)
    const align = model.align[col]
    if (align) cell.style.textAlign = align
    return cell
  }
  const head = el('thead')
  const headRow = el('tr')
  model.header.forEach((text, c) => headRow.appendChild(makeCell('th', -1, c, text)))
  head.appendChild(headRow)
  const body = el('tbody')
  model.rows.forEach((row, r) => {
    const tr = el('tr')
    row.forEach((text, c) => tr.appendChild(makeCell('td', r, c, text)))
    body.appendChild(tr)
  })
  table.append(head, body)
}

/** 이 위젯이 가리키는 원문 범위. 문서와 어긋나 있으면 null. */
function locate(view: EditorView, wrap: HTMLElement): { from: number; state: Live } | null {
  const state = live.get(wrap)
  if (!state || !wrap.isConnected) return null
  const from = view.posAtDOM(wrap)
  if (view.state.sliceDoc(from, from + state.source.length) !== state.source) return null
  return { from, state }
}

/** 표 모델을 고쳐 원문에 반영한다. 달라진 구간만 바꾼다. */
function commit(view: EditorView, wrap: HTMLElement, change: (model: TableModel) => TableModel): boolean {
  const at = locate(view, wrap)
  if (!at) return false
  const model = parseTable(at.state.source)
  if (!model) return false
  const next = serializeTable(change(model))
  const diff = diffRange(at.state.source, next)
  if (!diff) return true
  view.dispatch({
    changes: { from: at.from + diff.from, to: at.from + diff.to, insert: diff.insert },
    userEvent: 'input.table'
  })
  return true
}

export class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source
  }

  get estimatedHeight(): number {
    return this.source.split('\n').length * 34 + 30
  }

  ignoreEvent(): boolean {
    return true
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = el('div', 'cm-tn-table')
    const state: Live = { source: this.source, row: -1, col: 0, composing: false }
    live.set(wrap, state)

    const table = el('table')
    const model = parseTable(this.source)
    if (model) renderGrid(table, model)

    const bar = el('div', 'cm-tn-table-bar')
    const button = (label: string, title: string, run: () => void) => {
      const b = el('button', 'cm-tn-table-btn', label)
      b.type = 'button'
      b.title = title
      b.tabIndex = -1
      // 칸의 포커스(와 한글 조합)를 빼앗지 않는다.
      b.addEventListener('mousedown', (e) => e.preventDefault())
      b.addEventListener('click', (e) => {
        e.preventDefault()
        run()
      })
      bar.appendChild(b)
    }
    button('+ 행', '아래에 행 추가', () => {
      const at = state.row + 1
      if (commit(view, wrap, (m) => addRow(m, Math.min(at, m.rows.length)))) focusCell(wrap, at, state.col)
    })
    button('+ 열', '오른쪽에 열 추가', () => {
      const at = state.col + 1
      if (commit(view, wrap, (m) => addColumn(m, Math.min(at, m.header.length)))) focusCell(wrap, state.row, at)
    })
    button('− 행', '이 행 삭제(머리글 행은 지우지 않음)', () => {
      const row = state.row
      if (row < 0) return
      if (commit(view, wrap, (m) => removeRow(m, row))) {
        const left = wrap.querySelectorAll('tbody tr').length
        focusCell(wrap, Math.min(row, left - 1), state.col)
      }
    })
    button('− 열', '이 열 삭제', () => {
      const col = state.col
      if (commit(view, wrap, (m) => removeColumn(m, col))) {
        const left = wrap.querySelectorAll('thead th').length
        focusCell(wrap, state.row, Math.min(col, left - 1))
      }
    })
    button('원문', '이 표를 Markdown 원문으로 편집', () => {
      const at = locate(view, wrap)
      if (!at) return
      view.dispatch({ effects: showTableSource.of(at.from), selection: { anchor: at.from } })
      view.focus()
    })

    const sync = (cell: HTMLElement) => {
      const row = Number(cell.dataset.row)
      const col = Number(cell.dataset.col)
      commit(view, wrap, (m) => setCell(m, row, col, cell.textContent ?? ''))
    }
    const targetCell = (e: Event) =>
      e.target instanceof HTMLElement ? (e.target.closest('[data-col]') as HTMLElement | null) : null

    wrap.addEventListener('focusin', (e) => {
      const cell = targetCell(e)
      if (!cell) return
      state.row = Number(cell.dataset.row)
      state.col = Number(cell.dataset.col)
    })
    wrap.addEventListener('compositionstart', () => {
      state.composing = true
    })
    wrap.addEventListener('compositionend', (e) => {
      state.composing = false
      const cell = targetCell(e)
      if (cell) sync(cell)
    })
    // 조합 중에도 그때그때 원문에 반영한다. 반영 뒤 updateDOM은 포커스된 칸을 건드리지 않으므로 조합이 끊기지 않는다.
    wrap.addEventListener('input', (e) => {
      const cell = targetCell(e)
      if (cell) sync(cell)
    })
    wrap.addEventListener('keydown', (e) => {
      const cell = targetCell(e)
      if (!cell || e.isComposing || state.composing) return
      const row = Number(cell.dataset.row)
      const col = Number(cell.dataset.col)
      const cols = wrap.querySelectorAll('thead th').length
      const rows = wrap.querySelectorAll('tbody tr').length
      if (e.key === 'Tab') {
        e.preventDefault()
        let r = row
        let c = col + (e.shiftKey ? -1 : 1)
        if (c >= cols) {
          c = 0
          r++
        } else if (c < 0) {
          c = cols - 1
          r--
        }
        if (r < -1) return
        if (r >= rows && !commit(view, wrap, (m) => addRow(m))) return
        focusCell(wrap, r, c)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (row + 1 >= rows && !commit(view, wrap, (m) => addRow(m))) return
        focusCell(wrap, row + 1, col)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        const at = locate(view, wrap)
        if (!at) return
        const after = Math.min(at.from + state.source.length + 1, view.state.doc.length)
        view.dispatch({ selection: { anchor: after } })
        view.focus()
      }
    })

    wrap.append(table, bar)
    return wrap
  }

  /** 같은 자리의 표가 바뀌었을 때 DOM을 다시 만들지 않고 달라진 칸만 고친다(포커스·조합 유지). */
  updateDOM(dom: HTMLElement): boolean {
    const state = live.get(dom)
    const table = dom.querySelector('table')
    const model = parseTable(this.source)
    if (!state || !table || !model) return false
    state.source = this.source

    const current = cells(dom)
    const sameShape =
      dom.querySelectorAll('thead th').length === model.header.length &&
      dom.querySelectorAll('tbody tr').length === model.rows.length &&
      current.length === model.header.length * (model.rows.length + 1)
    if (!sameShape) {
      renderGrid(table as HTMLTableElement, model)
      return true
    }
    const active = dom.ownerDocument.activeElement
    for (const cell of current) {
      const row = Number(cell.dataset.row)
      const col = Number(cell.dataset.col)
      const want = row < 0 ? model.header[col] : model.rows[row][col]
      const align = model.align[col] ?? ''
      if (cell.style.textAlign !== align) cell.style.textAlign = align
      if (cell === active) {
        // 입력 중인 칸: 다듬은 내용이 같으면(끝의 공백 등) 그대로 둔다.
        if (cellText(cell) !== want && !state.composing) cell.textContent = want
      } else if (cell.textContent !== want) {
        cell.textContent = want
      }
    }
    return true
  }
}

/** from에서 시작하는 표 위젯의 첫 칸에 포커스를 준다(표를 새로 넣은 직후). */
export function focusTableAt(view: EditorView, from: number): void {
  for (const wrap of Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-tn-table'))) {
    if (view.posAtDOM(wrap) === from) {
      focusCell(wrap, -1, 0)
      return
    }
  }
}
