import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import type { Extension } from '@codemirror/state'
import { tags as t } from '@lezer/highlight'
import { GFM, type MarkdownConfig } from '@lezer/markdown'

const FOOTNOTE_REF = /^\[\^[^\s[\]]+\]/
const FOOTNOTE_DEF = /^\[\^[^\s[\]]+\]:/

/**
 * 각주 문법. `[^id]`는 FootnoteRef, 줄 머리의 `[^id]: 내용`은 FootnoteDef(안에 FootnoteLabel).
 * 정의는 한 줄만 묶는다. 이어지는 들여쓴 줄은 일반 문단/코드로 남는다(원문은 그대로).
 */
export const Footnote: MarkdownConfig = {
  defineNodes: [
    { name: 'FootnoteRef', style: t.link },
    { name: 'FootnoteDef', block: true },
    { name: 'FootnoteLabel', style: t.labelName }
  ],
  parseBlock: [
    {
      name: 'FootnoteDef',
      before: 'LinkReference',
      parse(cx, line) {
        const rest = line.text.slice(line.pos)
        const m = FOOTNOTE_DEF.exec(rest)
        if (!m) return false
        const from = cx.lineStart + line.pos
        const labelEnd = from + m[0].length
        const children = [
          cx.elt('FootnoteLabel', from, labelEnd),
          ...cx.parser.parseInline(rest.slice(m[0].length), labelEnd)
        ]
        cx.addElement(cx.elt('FootnoteDef', from, cx.lineStart + line.text.length, children))
        cx.nextLine()
        return true
      },
      endLeaf(_cx, line) {
        return FOOTNOTE_DEF.test(line.text.slice(line.pos))
      }
    }
  ],
  parseInline: [
    {
      name: 'FootnoteRef',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== 91 /* [ */ || cx.char(pos + 1) !== 94 /* ^ */) return -1
        const m = FOOTNOTE_REF.exec(cx.slice(pos, cx.end))
        if (!m) return -1
        return cx.addElement(cx.elt('FootnoteRef', pos, pos + m[0].length))
      }
    }
  ]
}

/** CommonMark + GFM(표·체크리스트·취소선·자동 링크) + 각주. 아래첨자/위첨자 확장은 `[^id]`와 헷갈리므로 쓰지 않는다. */
export function markdownSupport(): Extension {
  return markdown({ base: commonmarkLanguage, extensions: [GFM, Footnote], codeLanguages: languages })
}

/** 두 모드 공통: 코드 토큰 색, 원문 기호는 흐리게. */
export const baseHighlight: Extension = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.processingInstruction, color: 'var(--fg-faint)' },
    { tag: [t.comment, t.meta], color: 'var(--fg-faint)', fontStyle: 'italic' },
    { tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'var(--accent)' },
    { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--ok)' },
    { tag: [t.number, t.bool, t.atom, t.null], color: 'var(--warn)' },
    { tag: [t.typeName, t.className, t.namespace, t.tagName], color: 'var(--link)' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.attributeName], color: 'var(--link)' },
    { tag: [t.url, t.link], color: 'var(--link)' },
    { tag: t.labelName, color: 'var(--fg-muted)' },
    { tag: t.invalid, color: 'var(--danger)' }
  ])
)

/** 원문 모드 전용: 서식 보기에서는 장식 클래스가 맡는 것들을 색·굵기로만 표시. */
export const sourceHighlight: Extension = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading, color: 'var(--accent)', fontWeight: '700' },
    { tag: t.strong, fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.monospace, color: 'var(--code)' },
    { tag: t.quote, color: 'var(--fg-muted)' },
    { tag: t.contentSeparator, color: 'var(--fg-faint)' }
  ])
)
