import { syntaxTree } from '@codemirror/language'
import type { EditorState, Extension, Range, Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'

/* ---------- 위젯 ---------- */

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-tn-bullet'
    el.textContent = '•'
    return el
  }
}

export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked
  }
  toDOM(): HTMLElement {
    const el = document.createElement('input')
    el.type = 'checkbox'
    el.className = 'cm-tn-task'
    el.checked = this.checked
    el.tabIndex = -1
    return el
  }
  ignoreEvent(): boolean {
    return false
  }
}

class HrWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-tn-hr'
    return el
  }
}

export class FenceLabelWidget extends WidgetType {
  constructor(readonly lang: string) {
    super()
  }
  eq(other: FenceLabelWidget): boolean {
    return other.lang === this.lang
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-tn-fence-label'
    el.textContent = this.lang
    return el
  }
}

/* ---------- 장식 계산 (DOM 없이 동작) ---------- */

const hideDeco = Decoration.replace({ tn: 'hide' })
const bulletDeco = Decoration.replace({ widget: new BulletWidget(), tn: 'bullet' })
const hrDeco = Decoration.replace({ widget: new HrWidget(), tn: 'hr' })

const lineCache = new Map<string, Decoration>()
function lineDeco(cls: string): Decoration {
  let d = lineCache.get(cls)
  if (!d) lineCache.set(cls, (d = Decoration.line({ class: cls })))
  return d
}
const markCache = new Map<string, Decoration>()
function markDeco(cls: string): Decoration {
  let d = markCache.get(cls)
  if (!d) markCache.set(cls, (d = Decoration.mark({ class: cls })))
  return d
}

const INLINE_CLASS: Record<string, string> = {
  Emphasis: 'cm-tn-em',
  StrongEmphasis: 'cm-tn-strong',
  Strikethrough: 'cm-tn-strike'
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t'
}

/** 링크 대상에서 꺾쇠를 떼고, www.로 시작하는 자동 링크에는 스킴을 붙인다. */
export function normalizeUrl(raw: string): string {
  let url = raw.trim()
  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1)
  if (/^www\./i.test(url)) url = 'http://' + url
  return url
}

/**
 * from~to 범위의 서식 보기 장식을 만든다. 선택이 닿은 요소는 기호를 숨기지 않는다.
 * 표(최상위)는 table.ts의 StateField가 맡으므로 여기서는 다루지 않는다.
 */
export function buildLiveDecorations(state: EditorState, from: number, to: number): DecorationSet {
  const doc = state.doc
  const sel = state.selection.ranges
  const out: Range<Decoration>[] = []

  const touches = (a: number, b: number) => sel.some((r) => r.from <= b && r.to >= a)
  const oneLine = (a: number, b: number) => doc.lineAt(a).to >= b
  const hide = (a: number, b: number) => {
    if (b > a && oneLine(a, b)) out.push(hideDeco.range(a, b))
  }
  const mark = (a: number, b: number, deco: Decoration) => {
    if (b > a) out.push(deco.range(a, b))
  }
  /** 노드가 걸친 줄 가운데 보이는 범위에 드는 줄마다 클래스를 붙인다. */
  const lines = (a: number, b: number, cls: (first: boolean, last: boolean) => string) => {
    const firstNo = doc.lineAt(a).number
    const lastNo = doc.lineAt(b).number
    const start = Math.max(firstNo, doc.lineAt(Math.max(a, from)).number)
    const end = Math.min(lastNo, doc.lineAt(Math.min(b, to)).number)
    for (let n = start; n <= end; n++) {
      out.push(lineDeco(cls(n === firstNo, n === lastNo)).range(doc.line(n).from))
    }
  }
  const children = (node: SyntaxNode, name: string) => node.getChildren(name)

  syntaxTree(state).iterate({
    from,
    to,
    enter: (ref) => {
      const name = ref.name
      const a = ref.from
      const b = ref.to

      if (name.startsWith('ATXHeading')) {
        const level = name.slice(10)
        const line = doc.lineAt(a)
        out.push(lineDeco(`cm-tn-heading cm-tn-h${level}`).range(line.from))
        if (!touches(line.from, line.to)) {
          const marks = children(ref.node, 'HeaderMark')
          const open = marks[0]
          if (open && open.from === a) {
            let end = open.to
            while (end < b && isSpace(doc.sliceString(end, end + 1))) end++
            hide(open.from, end)
          }
          const close = marks.length > 1 ? marks[marks.length - 1] : null
          if (close && close.to === b) {
            let start = close.from
            while (start > a && isSpace(doc.sliceString(start - 1, start))) start--
            hide(start, close.to)
          }
        }
        return
      }

      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        const level = name === 'SetextHeading1' ? 1 : 2
        const underline = ref.node.getChild('HeaderMark')
        const touched = touches(a, b)
        const underNo = underline ? doc.lineAt(underline.from).number : -1
        const firstNo = doc.lineAt(a).number
        const lastNo = doc.lineAt(b).number
        for (let n = firstNo; n <= lastNo; n++) {
          const l = doc.line(n)
          if (l.to < from || l.from > to) continue
          if (n === underNo && !touched) out.push(lineDeco('cm-tn-setext-line').range(l.from))
          else if (n !== underNo) out.push(lineDeco(`cm-tn-heading cm-tn-h${level}`).range(l.from))
        }
        if (underline && !touched) hide(underline.from, underline.to)
        return
      }

      if (name in INLINE_CLASS) {
        mark(a, b, markDeco(INLINE_CLASS[name]))
        if (!touches(a, b)) {
          const markName = name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark'
          for (const m of children(ref.node, markName)) hide(m.from, m.to)
        }
        return
      }

      if (name === 'InlineCode') {
        const marks = children(ref.node, 'CodeMark')
        if (touches(a, b) || marks.length < 2) {
          mark(a, b, markDeco('cm-tn-code'))
        } else {
          const open = marks[0]
          const close = marks[marks.length - 1]
          if (close.from > open.to && oneLine(a, b)) {
            hide(open.from, open.to)
            mark(open.to, close.from, markDeco('cm-tn-code'))
            hide(close.from, close.to)
          } else {
            mark(a, b, markDeco('cm-tn-code'))
          }
        }
        return false
      }

      if (name === 'Link') {
        const node = ref.node
        const urlNode = node.getChild('URL')
        const marks = children(node, 'LinkMark')
        // [글자](주소) 꼴만 다듬는다. 참조 링크([글자][이름])는 원문 그대로.
        if (!urlNode || marks.length < 3) return
        const href = normalizeUrl(doc.sliceString(urlNode.from, urlNode.to))
        const link = Decoration.mark({ class: 'cm-tn-link', attributes: { 'data-href': href } })
        const open = marks[0]
        const close = marks[1]
        if (touches(a, b) || close.from === open.to || !oneLine(close.from, b)) {
          mark(a, b, link)
        } else {
          hide(open.from, open.to)
          mark(open.to, close.from, link)
          hide(close.from, b)
        }
        return
      }

      if (name === 'Autolink') {
        const node = ref.node
        const urlNode = node.getChild('URL')
        if (!urlNode) return false
        const href = normalizeUrl(doc.sliceString(urlNode.from, urlNode.to))
        mark(urlNode.from, urlNode.to, Decoration.mark({ class: 'cm-tn-link', attributes: { 'data-href': href } }))
        if (!touches(a, b)) for (const m of children(node, 'LinkMark')) hide(m.from, m.to)
        return false
      }

      if (name === 'URL') {
        // GFM의 맨 주소 자동 링크(부모가 Link 계열이 아닌 URL)
        const parent = ref.node.parent?.name
        if (parent === 'Link' || parent === 'Image' || parent === 'Autolink' || parent === 'LinkReference') return
        const href = normalizeUrl(doc.sliceString(a, b))
        mark(a, b, Decoration.mark({ class: 'cm-tn-link', attributes: { 'data-href': href } }))
        return
      }

      // 이미지, 링크 참조 정의, HTML은 원문 그대로 둔다.
      if (name === 'Image' || name === 'LinkReference' || name === 'HTMLBlock' || name === 'HTMLTag') return false

      if (name === 'Blockquote') {
        lines(a, b, () => 'cm-tn-quote')
        return
      }

      if (name === 'QuoteMark') {
        const line = doc.lineAt(a)
        if (!touches(line.from, line.to)) {
          const end = isSpace(doc.sliceString(b, b + 1)) ? b + 1 : b
          hide(a, end)
        }
        return
      }

      if (name === 'ListMark') {
        const item = ref.node.parent
        const list = item?.parent
        if (!item || !list) return
        const task = item.getChild('Task')
        const marker = task?.getChild('TaskMarker') ?? null
        if (list.name === 'OrderedList') {
          mark(a, b, markDeco('cm-tn-list-num'))
        } else if (touches(a, b)) {
          mark(a, b, markDeco('cm-tn-list-mark'))
        } else if (marker && marker.from > b && !touches(marker.from, marker.to)) {
          // 체크리스트는 글머리표 대신 체크박스만 보인다.
          hide(a, marker.from)
        } else {
          out.push(bulletDeco.range(a, b))
        }
        return
      }

      if (name === 'Task') {
        const marker = ref.node.getChild('TaskMarker')
        if (!marker) return
        const checked = /\[[xX]\]/.test(doc.sliceString(marker.from, marker.to))
        if (touches(marker.from, marker.to)) {
          mark(marker.from, marker.to, markDeco('cm-tn-task-raw'))
        } else {
          out.push(
            Decoration.replace({ widget: new CheckboxWidget(checked), tn: 'task', checked }).range(
              marker.from,
              marker.to
            )
          )
        }
        if (checked) {
          let start = marker.to
          while (start < b && isSpace(doc.sliceString(start, start + 1))) start++
          mark(start, b, markDeco('cm-tn-task-done'))
        }
        return
      }

      if (name === 'FencedCode') {
        const node = ref.node
        const marks = children(node, 'CodeMark')
        const open = marks[0]
        const close = marks.length > 1 ? marks[marks.length - 1] : null
        const openNo = doc.lineAt(a).number
        const closeNo = close ? doc.lineAt(close.from).number : -1
        const hidden = !touches(a, b)
        lines(a, b, (first, last) => {
          let cls = 'cm-tn-codeblock'
          if (first) cls += ' cm-tn-codeblock-first'
          if (last) cls += ' cm-tn-codeblock-last'
          return cls
        })
        if (hidden && open) {
          const info = node.getChild('CodeInfo')
          const openEnd = info ? info.to : open.to
          const lang = info ? doc.sliceString(info.from, info.to).trim() : ''
          if (oneLine(open.from, openEnd)) {
            out.push(
              Decoration.replace({ widget: new FenceLabelWidget(lang), tn: 'fence', lang }).range(
                open.from,
                openEnd
              )
            )
            out.push(lineDeco('cm-tn-fence').range(doc.line(openNo).from))
          }
          if (close && closeNo !== openNo) {
            hide(close.from, close.to)
            out.push(lineDeco('cm-tn-fence').range(doc.line(closeNo).from))
          }
        }
        return false // 안쪽 코드의 구문 트리로 내려가지 않는다
      }

      if (name === 'CodeBlock') {
        lines(a, b, (first, last) => {
          let cls = 'cm-tn-codeblock'
          if (first) cls += ' cm-tn-codeblock-first'
          if (last) cls += ' cm-tn-codeblock-last'
          return cls
        })
        return false
      }

      if (name === 'HorizontalRule') {
        const line = doc.lineAt(a)
        if (!touches(line.from, line.to) && oneLine(a, b)) out.push(hrDeco.range(a, b))
        return
      }

      if (name === 'FootnoteRef') {
        const id = doc.sliceString(a + 2, b - 1)
        const ref_ = Decoration.mark({ class: 'cm-tn-fnref', attributes: { 'data-fn': id } })
        if (touches(a, b)) {
          mark(a, b, markDeco('cm-tn-fnref-raw'))
        } else {
          hide(a, a + 2)
          mark(a + 2, b - 1, ref_)
          hide(b - 1, b)
        }
        return false
      }

      if (name === 'FootnoteDef') {
        out.push(lineDeco('cm-tn-fndef').range(doc.lineAt(a).from))
        const label = ref.node.getChild('FootnoteLabel')
        if (label) mark(label.from, label.to, markDeco('cm-tn-fnlabel'))
        return
      }

      if (name === 'Table') {
        // 위젯으로 바뀌지 않은 표(원문 보기 중이거나 인용문·목록 안의 표)는 칸이 맞도록 고정폭으로.
        lines(a, b, () => 'cm-tn-rawtable')
        return false
      }
      return
    }
  })

  return Decoration.set(out, true)
}

/** `[^id]:` 정의 줄을 찾아 내용이 시작하는 위치를 돌려준다. */
export function findFootnoteDef(doc: Text, id: string): number | null {
  const label = `[^${id}]:`
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const text = line.text
    if (text.length < label.length) continue
    const indent = text.length - text.trimStart().length
    if (indent > 3 || !text.startsWith(label, indent)) continue
    let pos = indent + label.length
    while (pos < text.length && isSpace(text[pos])) pos++
    return line.from + pos
  }
  return null
}

/** 체크박스 원문(`[ ]`/`[x]`)을 뒤집는 변경. 그 자리가 체크박스가 아니면 null. */
export function toggleTaskChange(
  doc: Text,
  pos: number
): { from: number; to: number; insert: string } | null {
  const text = doc.sliceString(pos, pos + 3)
  if (text === '[ ]') return { from: pos, to: pos + 3, insert: '[x]' }
  if (text === '[x]' || text === '[X]') return { from: pos, to: pos + 3, insert: '[ ]' }
  return null
}

/* ---------- 뷰 플러그인 ---------- */

export interface LiveCallbacks {
  onOpenLink(url: string): void
}

function visibleSpan(view: EditorView): { from: number; to: number } {
  const ranges = view.visibleRanges
  if (!ranges.length) return view.viewport
  return { from: ranges[0].from, to: ranges[ranges.length - 1].to }
}

function closest(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? (target.closest(selector) as HTMLElement | null) : null
}

/** 표를 뺀 인라인·줄 장식. 보이는 범위만 계산한다. */
export function livePreview(callbacks: LiveCallbacks): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = this.build(view)
      }
      build(view: EditorView): DecorationSet {
        const { from, to } = visibleSpan(view)
        return buildLiveDecorations(view.state, from, to)
      }
      update(u: ViewUpdate): void {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          syntaxTree(u.startState) !== syntaxTree(u.state)
        ) {
          this.decorations = this.build(u.view)
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(event: MouseEvent, view: EditorView) {
          if (event.button !== 0) return false

          const box = closest(event.target, 'input.cm-tn-task')
          if (box) {
            const change = toggleTaskChange(view.state.doc, view.posAtDOM(box))
            if (change) view.dispatch({ changes: change, userEvent: 'input.toggle' })
            event.preventDefault()
            return true
          }

          if (event.metaKey || event.ctrlKey) {
            const link = closest(event.target, '.cm-tn-link[data-href]')
            const href = link?.getAttribute('data-href')
            if (href) {
              event.preventDefault()
              callbacks.onOpenLink(href)
              return true
            }
            return false
          }

          const fn = closest(event.target, '.cm-tn-fnref[data-fn]')
          if (fn && !event.shiftKey && !event.altKey) {
            const pos = findFootnoteDef(view.state.doc, fn.getAttribute('data-fn') ?? '')
            if (pos != null) {
              event.preventDefault()
              view.dispatch({
                selection: { anchor: pos },
                effects: EditorView.scrollIntoView(pos, { y: 'center' })
              })
              view.focus()
              return true
            }
          }
          return false
        }
      }
    }
  )
}
