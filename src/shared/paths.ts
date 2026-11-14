/** 화면 쪽에서 쓰는 최소한의 경로 도구. macOS(/)와 Windows(\) 구분자를 모두 받아들인다. */

const isSep = (ch: string) => ch === '/' || ch === '\\'

export function sepOf(path: string): string {
  return path.includes('\\') && !path.startsWith('/') ? '\\' : '/'
}

function trimEnd(path: string): string {
  let end = path.length
  while (end > 1 && isSep(path[end - 1])) end--
  return path.slice(0, end)
}

export function basename(path: string): string {
  const p = trimEnd(path)
  let i = p.length - 1
  while (i >= 0 && !isSep(p[i])) i--
  return p.slice(i + 1)
}

export function dirname(path: string): string {
  const p = trimEnd(path)
  let i = p.length - 1
  while (i >= 0 && !isSep(p[i])) i--
  if (i < 0) return p
  if (i === 0) return p[0]
  // "C:\" 같은 드라이브 루트는 구분자를 남긴다.
  if (i === 2 && p[1] === ':') return p.slice(0, 3)
  return p.slice(0, i)
}

export function join(dir: string, name: string): string {
  const d = trimEnd(dir)
  return isSep(d[d.length - 1]) ? d + name : d + sepOf(dir) + name
}

/** path가 dir 자신이거나 그 아래에 있는지. */
export function isInside(path: string, dir: string): boolean {
  const d = trimEnd(dir)
  if (path === d) return true
  return path.startsWith(d) && isSep(path[d.length])
}

/** 폴더 이름이 바뀌었을 때 그 아래 경로를 새 위치로 옮긴다. */
export function rebase(path: string, from: string, to: string): string {
  return isInside(path, from) ? to + path.slice(trimEnd(from).length) : path
}

/** 파일 이름으로 쓸 수 없는 입력인지 확인한다. 문제가 있으면 이유를 돌려준다. */
export function invalidName(name: string): string | null {
  const n = name.trim()
  if (!n) return '이름을 입력하세요.'
  if (n === '.' || n === '..') return '사용할 수 없는 이름입니다.'
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(n)) return '이름에 \\ / : * ? " < > | 문자는 쓸 수 없습니다.'
  if (/[. ]$/.test(n)) return '이름은 마침표나 공백으로 끝날 수 없습니다.'
  return null
}
