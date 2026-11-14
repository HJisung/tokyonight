import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { lineTarget, tableInsertion } from '../src/editor/index'
import { markdownSupport } from '../src/editor/markdown'
import { findTables, showTableSource, tableField, TableWidget } from '../src/editor/table'
import { addRow, EMPTY_TABLE, parseTable, serializeTable, setCell } from '../src/shared/table'
import { diffRange } from '../src/shared/text'

function make(doc: string, cursor = 0): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdownSupport(), tableField]
  })
  ensureSyntaxTree(state, doc.length, 5000)
  return state
}

function widgets(state: EditorState): { from: number; to: number; source: string }[] {
  const out: { from: number; to: number; source: string }[] = []
  state.field(tableField).deco.between(0, state.doc.length, (from, to, value) => {
    out.push({ from, to, source: (value.spec.widget as TableWidget).source })
  })
  return out
}

const TABLE = '| 이름 | 값 |\n| --- | ---: |\n| a | 1 |\n| b | 2 |'

describe('표 찾기', () => {
  it('최상위 표의 줄 전체 범위와 원문', () => {
    const doc = `앞 문단\n\n${TABLE}\n\n뒤 문단`
    const tables = findTables(make(doc))
    expect(tables).toEqual([{ from: 6, to: 6 + TABLE.length, source: TABLE }])
  })

  it('문서 끝의 표, 여러 개의 표', () => {
    const doc = `${TABLE}\n\n글\n\n${TABLE}`
    const tables = findTables(make(doc))
    expect(tables.map((t) => t.source)).toEqual([TABLE, TABLE])
    expect(tables[1].to).toBe(doc.length)
  })

  it('인용문·목록 안의 표와 코드 블록 안의 표는 건드리지 않는다', () => {
    const quoted = TABLE.split('\n')
      .map((l) => '> ' + l)
      .join('\n')
    expect(findTables(make(`${quoted}\n\n\`\`\`\n${TABLE}\n\`\`\`\n`))).toEqual([])
  })
})

describe('표 위젯 필드', () => {
  it('표를 블록 위젯으로 바꾼다', () => {
    const state = make(`글\n\n${TABLE}\n\n끝`)
    const w = widgets(state)
    expect(w).toEqual([{ from: 3, to: 3 + TABLE.length, source: TABLE }])
  })

  it('셀 편집: 직렬화한 표를 달라진 구간만 반영하고 위젯이 따라온다', () => {
    let state = make(`글\n\n${TABLE}\n\n끝`)
    const model = parseTable(TABLE)!
    const next = serializeTable(setCell(model, 0, 1, '한글 | 값'))
    const d = diffRange(TABLE, next)!
    state = state.update({ changes: { from: 3 + d.from, to: 3 + d.to, insert: d.insert } }).state
    ensureSyntaxTree(state, state.doc.length, 5000)
    expect(state.doc.toString()).toBe(`글\n\n${next}\n\n끝`)
    expect(next).toContain('한글 \\| 값')
    const w = widgets(state)
    expect(w).toHaveLength(1)
    expect(parseTable(w[0].source)!.rows[0]).toEqual(['a', '한글 \\| 값'])
  })

  it('행 추가 뒤에도 하나의 표로 남는다', () => {
    let state = make(TABLE)
    const next = serializeTable(addRow(parseTable(TABLE)!))
    state = state.update({ changes: { from: 0, to: TABLE.length, insert: next } }).state
    ensureSyntaxTree(state, state.doc.length, 5000)
    expect(widgets(state).map((w) => parseTable(w.source)!.rows.length)).toEqual([3])
  })

  it('"원문": 선택이 표 안에 있는 동안만 위젯을 치운다', () => {
    let state = make(`글\n\n${TABLE}\n\n끝`)
    state = state.update({ effects: showTableSource.of(3), selection: { anchor: 3 } }).state
    expect(widgets(state)).toEqual([])
    // 표 안에서 고치는 동안에는 원문 유지
    state = state.update({ changes: { from: 5, insert: '새' }, selection: { anchor: 6 } }).state
    ensureSyntaxTree(state, state.doc.length, 5000)
    expect(widgets(state)).toEqual([])
    // 표 밖으로 나가면 다시 위젯
    state = state.update({ selection: { anchor: 0 } }).state
    expect(widgets(state)).toHaveLength(1)
    // 다시 들어가도(위젯이라 실제로는 못 들어가지만) 원문으로 돌아가지 않는다
    state = state.update({ selection: { anchor: 3 } }).state
    expect(widgets(state)).toHaveLength(1)
  })

  it('위젯 동등성은 원문으로 판단한다', () => {
    expect(new TableWidget(TABLE).eq(new TableWidget(TABLE))).toBe(true)
    expect(new TableWidget(TABLE).eq(new TableWidget(TABLE + ' '))).toBe(false)
  })
})

describe('표 넣기', () => {
  const run = (doc: string, cursor: number) => {
    const state = make(doc, cursor)
    const { spec, tableFrom } = tableInsertion(state)
    const next = state.update(spec).state
    ensureSyntaxTree(next, next.doc.length, 5000)
    return { next, tableFrom }
  }
  const body = EMPTY_TABLE.replace(/\n$/, '')

  it('빈 문서', () => {
    const { next, tableFrom } = run('', 0)
    expect(next.doc.toString()).toBe(EMPTY_TABLE)
    expect(tableFrom).toBe(0)
    expect(next.selection.main.head).toBe(next.doc.length)
    expect(widgets(next)).toHaveLength(1)
  })

  it('글이 있는 줄에서는 다음 줄에, 앞뒤로 빈 줄을 둔다', () => {
    const { next, tableFrom } = run('첫 줄\n둘째 줄', 1)
    expect(next.doc.toString()).toBe(`첫 줄\n\n${body}\n\n둘째 줄`)
    expect(widgets(next)).toEqual([{ from: tableFrom, to: tableFrom + body.length, source: body }])
    expect(next.doc.lineAt(next.selection.main.head).text).toBe('')
  })

  it('빈 줄에서는 그 자리에', () => {
    const { next, tableFrom } = run('위\n\n\n아래', 3)
    expect(next.doc.toString()).toBe(`위\n\n${body}\n\n아래`)
    expect(tableFrom).toBe(3)
    expect(widgets(next)).toHaveLength(1)
  })

  it('바로 윗줄에 글이 있으면 빈 줄을 끼운다', () => {
    const { next } = run('위\n', 2)
    expect(next.doc.toString()).toBe(`위\n\n${body}\n`)
    expect(widgets(next)).toHaveLength(1)
    expect(next.selection.main.head).toBe(next.doc.length)
  })
})

describe('줄로 이동', () => {
  it('줄 번호를 문서 범위로 맞추고, 찾는 말이 있으면 선택한다', () => {
    const state = make('하나\n둘 Hello 셋\n넷')
    expect(lineTarget(state.doc, 2)).toEqual({ anchor: 3, head: 3 })
    expect(lineTarget(state.doc, 2, 'hello')).toEqual({ anchor: 5, head: 10 })
    expect(lineTarget(state.doc, 2, '없는 말')).toEqual({ anchor: 3, head: 3 })
    expect(lineTarget(state.doc, 0)).toEqual({ anchor: 0, head: 0 })
    expect(lineTarget(state.doc, 99)).toEqual({ anchor: 13, head: 13 })
  })
})
