import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import type { Decoration } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { buildLiveDecorations, findFootnoteDef, normalizeUrl, toggleTaskChange } from '../src/editor/live'
import { markdownSupport } from '../src/editor/markdown'

interface Deco {
  from: number
  to: number
  text: string
  spec: Decoration['spec']
}

/** `|`는 커서 위치. 없으면 문서 끝(대개 아무 요소에도 닿지 않게 빈 줄을 덧붙여 쓴다). */
function setup(src: string): { state: EditorState; decos: Deco[] } {
  const at = src.indexOf('¦')
  const doc = at < 0 ? src : src.slice(0, at) + src.slice(at + 1)
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(at < 0 ? doc.length : at),
    extensions: [markdownSupport()]
  })
  ensureSyntaxTree(state, doc.length, 5000)
  const decos: Deco[] = []
  buildLiveDecorations(state, 0, doc.length).between(0, doc.length, (from, to, value) => {
    decos.push({ from, to, text: doc.slice(from, to), spec: value.spec })
  })
  decos.sort((x, y) => x.from - y.from || x.to - y.to)
  return { state, decos }
}

const hidden = (d: Deco[]) => d.filter((x) => x.spec.tn === 'hide').map((x) => x.text)
const classes = (d: Deco[]) => d.filter((x) => x.spec.class).map((x) => `${x.spec.class}:${x.text}`)
const lineClasses = (d: Deco[]) => d.filter((x) => x.spec.class && x.from === x.to).map((x) => x.spec.class)

describe('서식 보기 장식', () => {
  it('제목: 커서가 없으면 # 기호와 공백을 숨긴다', () => {
    const { decos } = setup('## 제목 ##\n\n끝')
    expect(lineClasses(decos)).toEqual(['cm-tn-heading cm-tn-h2'])
    expect(hidden(decos)).toEqual(['## ', ' ##'])
  })

  it('제목: 커서가 그 줄에 있으면 기호를 그대로 둔다', () => {
    const { decos } = setup('# 제¦목\n\n끝')
    expect(lineClasses(decos)).toEqual(['cm-tn-heading cm-tn-h1'])
    expect(hidden(decos)).toEqual([])
  })

  it('setext 제목: 밑줄 줄을 숨긴다', () => {
    const { decos } = setup('제목\n===\n\n끝')
    expect(lineClasses(decos)).toEqual(['cm-tn-heading cm-tn-h1', 'cm-tn-setext-line'])
    expect(hidden(decos)).toEqual(['==='])
  })

  it('굵게·기울임·취소선·인라인 코드', () => {
    const { decos } = setup('**굵게** *기울임* ~~취소~~ `코드`\n\n끝')
    expect(hidden(decos)).toEqual(['**', '**', '*', '*', '~~', '~~', '`', '`'])
    expect(classes(decos)).toEqual([
      'cm-tn-strong:**굵게**',
      'cm-tn-em:*기울임*',
      'cm-tn-strike:~~취소~~',
      'cm-tn-code:코드'
    ])
  })

  it('커서가 닿은 요소만 기호를 보여준다', () => {
    const { decos } = setup('**굵¦게** *기울임*\n\n끝')
    expect(hidden(decos)).toEqual(['*', '*'])
  })

  it('링크: 글자만 남기고 주소를 data-href로 싣는다', () => {
    const { decos } = setup('[글자](https://example.com "제목") 뒤\n\n끝')
    expect(hidden(decos)).toEqual(['[', '](https://example.com "제목")'])
    const link = decos.find((d) => d.spec.class === 'cm-tn-link')
    expect(link?.text).toBe('글자')
    expect(link?.spec.attributes['data-href']).toBe('https://example.com')
  })

  it('링크: 커서가 닿으면 원문 전체를 보여주되 링크로는 남는다', () => {
    const { decos } = setup('[글¦자](https://example.com)\n\n끝')
    expect(hidden(decos)).toEqual([])
    expect(decos.find((d) => d.spec.class === 'cm-tn-link')?.text).toBe('[글자](https://example.com)')
  })

  it('자동 링크와 맨 주소', () => {
    const { decos } = setup('<https://a.example> www.b.example\n\n끝')
    expect(hidden(decos)).toEqual(['<', '>'])
    const hrefs = decos.filter((d) => d.spec.class === 'cm-tn-link').map((d) => d.spec.attributes['data-href'])
    expect(hrefs).toEqual(['https://a.example', 'http://www.b.example'])
  })

  it('이미지와 참조 링크는 원문 그대로', () => {
    const { decos } = setup('![그림](a.png) [글자][참조]\n\n[참조]: https://example.com\n\n끝')
    expect(decos).toEqual([])
  })

  it('인용문: 줄마다 클래스, 커서가 없는 줄의 > 를 숨긴다', () => {
    const { decos } = setup('> 첫¦ 줄\n> 둘째 줄\n\n끝')
    expect(lineClasses(decos)).toEqual(['cm-tn-quote', 'cm-tn-quote'])
    expect(hidden(decos)).toEqual(['> '])
    expect(decos.find((d) => d.spec.tn === 'hide')?.from).toBe(6)
  })

  it('목록: 글머리표는 위젯, 번호는 그대로', () => {
    const { decos } = setup('- 하나\n* 둘\n\n1. 셋\n\n끝')
    expect(decos.filter((d) => d.spec.tn === 'bullet').map((d) => d.text)).toEqual(['-', '*'])
    expect(classes(decos)).toEqual(['cm-tn-list-num:1.'])
  })

  it('체크리스트: 글머리표를 숨기고 체크박스 위젯으로', () => {
    const { decos } = setup('- [ ] 할 일\n- [x] 한 일\n\n끝')
    expect(hidden(decos)).toEqual(['- ', '- '])
    const boxes = decos.filter((d) => d.spec.tn === 'task')
    expect(boxes.map((d) => [d.text, d.spec.checked])).toEqual([
      ['[ ]', false],
      ['[x]', true]
    ])
    expect(classes(decos)).toEqual(['cm-tn-task-done:한 일'])
  })

  it('울타리 코드 블록: 줄 클래스와 언어 표시, 안쪽은 장식하지 않는다', () => {
    const { decos } = setup('```md\n# 제목 아님\n**굵게 아님**\n```\n\n끝')
    expect(lineClasses(decos).filter((c) => c.startsWith('cm-tn-codeblock'))).toEqual([
      'cm-tn-codeblock cm-tn-codeblock-first',
      'cm-tn-codeblock',
      'cm-tn-codeblock',
      'cm-tn-codeblock cm-tn-codeblock-last'
    ])
    const fence = decos.find((d) => d.spec.tn === 'fence')
    expect(fence?.text).toBe('```md')
    expect(fence?.spec.lang).toBe('md')
    expect(hidden(decos)).toEqual(['```'])
    expect(classes(decos).some((c) => c.includes('heading') || c.includes('strong'))).toBe(false)
  })

  it('울타리 코드 블록: 커서가 안에 있으면 울타리를 보여준다', () => {
    const { decos } = setup('```js\nle¦t a\n```\n\n끝')
    expect(decos.some((d) => d.spec.tn === 'fence' || d.spec.tn === 'hide')).toBe(false)
    expect(lineClasses(decos)).toHaveLength(3)
  })

  it('들여쓴 코드 블록과 가로줄', () => {
    const { decos } = setup('문단\n\n    코드\n\n---\n\n끝')
    expect(lineClasses(decos)).toEqual(['cm-tn-codeblock cm-tn-codeblock-first cm-tn-codeblock-last'])
    expect(decos.filter((d) => d.spec.tn === 'hr').map((d) => d.text)).toEqual(['---'])
  })

  it('각주: 참조는 위첨자, 정의 줄은 따로 표시', () => {
    const { decos } = setup('본문[^1] 계속\n\n[^1]: 한 단어\n[^note]: 여러 단어 **굵게**\n\n끝')
    expect(hidden(decos)).toEqual(['[^', ']', '**', '**'])
    const ref = decos.find((d) => d.spec.class === 'cm-tn-fnref')
    expect(ref?.text).toBe('1')
    expect(ref?.spec.attributes['data-fn']).toBe('1')
    expect(lineClasses(decos)).toEqual(['cm-tn-fndef', 'cm-tn-fndef'])
    expect(classes(decos).filter((c) => c.startsWith('cm-tn-fnlabel'))).toEqual([
      'cm-tn-fnlabel:[^1]:',
      'cm-tn-fnlabel:[^note]:'
    ])
  })

  it('한 줄에 각주 참조가 여러 개 있어도 따로 잡는다', () => {
    const { decos } = setup('가[^a] 나[^b]\n\n끝')
    expect(decos.filter((d) => d.spec.class === 'cm-tn-fnref').map((d) => d.text)).toEqual(['a', 'b'])
  })

  it('보이는 범위 밖의 요소는 계산하지 않는다', () => {
    const doc = '# 하나\n\n문단\n\n# 둘\n\n끝'
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [markdownSupport()]
    })
    ensureSyntaxTree(state, doc.length, 5000)
    const from = doc.indexOf('# 둘')
    let count = 0
    buildLiveDecorations(state, from, doc.length).between(0, doc.length, (f) => {
      expect(f).toBeGreaterThanOrEqual(from)
      count++
    })
    expect(count).toBe(2)
  })
})

describe('서식 보기 도우미', () => {
  it('findFootnoteDef: 정의 내용이 시작하는 위치', () => {
    const { state } = setup('본문[^1]\n\n[^10]: 다른 것\n  [^1]:   내용')
    const pos = findFootnoteDef(state.doc, '1')
    expect(pos).not.toBeNull()
    expect(state.doc.sliceString(pos!)).toBe('내용')
    expect(findFootnoteDef(state.doc, '없음')).toBeNull()
  })

  it('toggleTaskChange: 체크 상태를 뒤집는다', () => {
    const { state } = setup('- [ ] a\n- [X] b')
    expect(toggleTaskChange(state.doc, 2)).toEqual({ from: 2, to: 5, insert: '[x]' })
    expect(toggleTaskChange(state.doc, 10)).toEqual({ from: 10, to: 13, insert: '[ ]' })
    expect(toggleTaskChange(state.doc, 0)).toBeNull()
  })

  it('normalizeUrl', () => {
    expect(normalizeUrl('<https://a.b/c d>')).toBe('https://a.b/c d')
    expect(normalizeUrl('www.a.b')).toBe('http://www.a.b')
    expect(normalizeUrl('./note.md')).toBe('./note.md')
  })
})
