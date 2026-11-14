export type Align = 'left' | 'center' | 'right' | null

export interface TableModel {
  header: string[]
  align: Align[]
  rows: string[][]
}

/** 이스케이프되지 않은 | 기준으로 한 줄을 셀로 나눈다. 셀 내용은 원문 그대로 둔다. */
export function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1]
      i++
    } else if (ch === '|') {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

function parseAlign(cell: string): Align | undefined {
  const m = /^(:?)-+(:?)$/.exec(cell.trim())
  if (!m) return undefined
  if (m[1] && m[2]) return 'center'
  if (m[2]) return 'right'
  if (m[1]) return 'left'
  return null
}

export function parseTable(source: string): TableModel | null {
  const lines = source.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length < 2) return null
  const header = splitRow(lines[0])
  const delim = splitRow(lines[1]).map(parseAlign)
  if (delim.some((a) => a === undefined) || delim.length !== header.length) return null
  const cols = header.length
  const rows = lines.slice(2).map((l) => {
    const cells = splitRow(l).slice(0, cols)
    while (cells.length < cols) cells.push('')
    return cells
  })
  return { header, align: delim as Align[], rows }
}

/** 사용자가 셀에 입력한 내용을 표 문법이 깨지지 않게 다듬는다. */
export function sanitizeCell(text: string): string {
  return text
    .replace(/\r?\n/g, ' ')
    .replace(/(\\.)|\|/g, (m, esc) => (esc ? m : '\\|'))
    .trim()
}

export function serializeTable(model: TableModel): string {
  const delim = model.align.map((a) =>
    a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'
  )
  const row = (cells: string[]) => '| ' + cells.map((c) => (c.length ? c : ' ')).join(' | ') + ' |'
  return [row(model.header), row(delim), ...model.rows.map(row)].join('\n')
}

export function addRow(model: TableModel, at = model.rows.length): TableModel {
  const rows = model.rows.slice()
  rows.splice(at, 0, model.header.map(() => ''))
  return { ...model, rows }
}

export function addColumn(model: TableModel, at = model.header.length): TableModel {
  const ins = <T>(arr: T[], v: T) => [...arr.slice(0, at), v, ...arr.slice(at)]
  return {
    header: ins(model.header, '제목'),
    align: ins(model.align, null),
    rows: model.rows.map((r) => ins(r, ''))
  }
}

/** 본문 행을 지운다. 머리글 행은 지우지 않는다. */
export function removeRow(model: TableModel, at: number): TableModel {
  if (at < 0 || at >= model.rows.length) return model
  return { ...model, rows: model.rows.filter((_, i) => i !== at) }
}

export function removeColumn(model: TableModel, at: number): TableModel {
  if (model.header.length <= 1 || at < 0 || at >= model.header.length) return model
  const drop = <T>(arr: T[]) => arr.filter((_, i) => i !== at)
  return { header: drop(model.header), align: drop(model.align), rows: model.rows.map(drop) }
}

export function setCell(model: TableModel, row: number, col: number, text: string): TableModel {
  const value = sanitizeCell(text)
  if (row < 0) {
    const header = model.header.slice()
    header[col] = value
    return { ...model, header }
  }
  const rows = model.rows.map((r) => r.slice())
  rows[row][col] = value
  return { ...model, rows }
}

export const EMPTY_TABLE = '| 제목 | 제목 |\n| --- | --- |\n|  |  |\n'
