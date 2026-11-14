import type { DocRef, EditMode, LayoutNode, Leaf, Split } from './types'

export const newId = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export function makeLeaf(doc: DocRef | null = null, mode: EditMode = 'live'): Leaf {
  return { type: 'leaf', id: newId(), doc, mode }
}

export function leaves(node: LayoutNode): Leaf[] {
  return node.type === 'leaf' ? [node] : node.children.flatMap(leaves)
}

export function findLeaf(node: LayoutNode, id: string): Leaf | null {
  return leaves(node).find((l) => l.id === id) ?? null
}

export function updateLeaf(node: LayoutNode, id: string, patch: Partial<Omit<Leaf, 'type' | 'id'>>): LayoutNode {
  if (node.type === 'leaf') return node.id === id ? { ...node, ...patch } : node
  return { ...node, children: node.children.map((c) => updateLeaf(c, id, patch)) }
}

export function mapLeaves(node: LayoutNode, fn: (leaf: Leaf) => Leaf): LayoutNode {
  if (node.type === 'leaf') return fn(node)
  return { ...node, children: node.children.map((c) => mapLeaves(c, fn)) }
}

/**
 * leafId 영역을 dir 방향으로 나누고 그 뒤에 added를 둔다.
 * 부모가 같은 방향의 분할이면 중첩하지 않고 형제로 끼워 넣는다.
 */
export function splitLeaf(node: LayoutNode, leafId: string, dir: Split['dir'], added: Leaf): LayoutNode {
  if (node.type === 'leaf') {
    if (node.id !== leafId) return node
    return { type: 'split', id: newId(), dir, sizes: [0.5, 0.5], children: [node, added] }
  }
  const idx = node.children.findIndex((c) => c.type === 'leaf' && c.id === leafId)
  if (idx >= 0 && node.dir === dir) {
    const half = node.sizes[idx] / 2
    const sizes = [...node.sizes.slice(0, idx), half, half, ...node.sizes.slice(idx + 1)]
    const children = [...node.children.slice(0, idx + 1), added, ...node.children.slice(idx + 1)]
    return { ...node, sizes, children }
  }
  return { ...node, children: node.children.map((c) => splitLeaf(c, leafId, dir, added)) }
}

/** 영역을 닫는다. 마지막 영역이었다면 null. 자식이 하나 남은 분할은 접는다. */
export function closeLeaf(node: LayoutNode, leafId: string): LayoutNode | null {
  if (node.type === 'leaf') return node.id === leafId ? null : node
  const children: LayoutNode[] = []
  const sizes: number[] = []
  node.children.forEach((c, i) => {
    const next = closeLeaf(c, leafId)
    if (next) {
      children.push(next)
      sizes.push(node.sizes[i])
    }
  })
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return { ...node, children, sizes: normalize(sizes) }
}

export function setSizes(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === 'leaf') return node
  if (node.id === splitId) return { ...node, sizes: normalize(sizes) }
  return { ...node, children: node.children.map((c) => setSizes(c, splitId, sizes)) }
}

export function normalize(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return sizes.map(() => 1 / sizes.length)
  return sizes.map((s) => s / total)
}

/** 저장된 세션을 불러올 때 구조가 올바른지 확인한다. */
export function isValidLayout(node: unknown): node is LayoutNode {
  if (!node || typeof node !== 'object') return false
  const n = node as Record<string, unknown>
  if (typeof n.id !== 'string') return false
  if (n.type === 'leaf') {
    if (n.mode !== 'live' && n.mode !== 'source') return false
    if (n.doc === null) return true
    const d = n.doc as Record<string, unknown> | undefined
    if (!d || typeof d !== 'object') return false
    return (d.type === 'file' && typeof d.path === 'string') || (d.type === 'scratch' && typeof d.id === 'string')
  }
  if (n.type === 'split') {
    if (n.dir !== 'row' && n.dir !== 'column') return false
    if (!Array.isArray(n.children) || !Array.isArray(n.sizes)) return false
    if (n.children.length < 2 || n.children.length !== n.sizes.length) return false
    return n.sizes.every((s) => typeof s === 'number' && s > 0) && n.children.every(isValidLayout)
  }
  return false
}
