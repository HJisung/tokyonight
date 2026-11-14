import type { DocKind, Eol } from './types'

/** 디스크의 원문을 편집용 문자열(LF)로 바꾸고, 저장할 때 되돌릴 정보를 남긴다. */
export function decodeText(raw: string): { content: string; eol: Eol; bom: boolean } {
  const bom = raw.charCodeAt(0) === 0xfeff
  const body = bom ? raw.slice(1) : raw
  const crlf = (body.match(/\r\n/g) ?? []).length
  const lf = (body.match(/\n/g) ?? []).length - crlf
  const eol: Eol = crlf > lf ? '\r\n' : '\n'
  return { content: body.replace(/\r\n?/g, '\n'), eol, bom }
}

export function encodeText(content: string, eol: Eol, bom: boolean): string {
  const body = eol === '\r\n' ? content.replace(/\n/g, '\r\n') : content
  return (bom ? '﻿' : '') + body
}

export function kindOf(name: string): DocKind {
  return /\.(md|markdown)$/i.test(name) ? 'md' : 'txt'
}

/** 앱이 문서로 여는 파일: .md, .txt, 확장자 없는 파일. */
export function isSupported(name: string): boolean {
  if (name.startsWith('.')) return false
  if (/\.(md|markdown|txt)$/i.test(name)) return true
  return !name.includes('.')
}

/** 두 문자열에서 달라진 가운데 구간만 찾아낸다. 외부 변경을 반영할 때 커서를 최대한 유지하기 위함. */
export function diffRange(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null
  const max = Math.min(a.length, b.length)
  let start = 0
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--
    endB--
  }
  return { from: start, to: endA, insert: b.slice(start, endB) }
}

export function scratchTitle(content: string): string {
  const line = content.split('\n').find((l) => l.trim().length > 0)
  if (!line) return '임시 메모'
  const cleaned = line.replace(/^#+\s*/, '').trim()
  return cleaned.length > 40 ? cleaned.slice(0, 40) + '…' : cleaned || '임시 메모'
}

/** 이름 충돌 시 "이름 2.md" 같은 후보를 만든다. */
export function numberedName(name: string, n: number): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return `${name} ${n}`
  return `${name.slice(0, dot)} ${n}${name.slice(dot)}`
}
