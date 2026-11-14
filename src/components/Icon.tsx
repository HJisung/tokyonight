import type { CSSProperties } from 'react'

const paths = {
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  folderPlus: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 11v6m-3-3h6" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 14h8m-8 3h5" /></>,
  note: <><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="m17 3 4 4-10 10H7v-4Z" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  home: <><path d="m3 10 9-7 9 7M5 9v11h14V9M9 20v-7h6v7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  more: <><circle cx="5" cy="12" r=".8" /><circle cx="12" cy="12" r=".8" /><circle cx="19" cy="12" r=".8" /></>,
  splitRight: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>,
  splitDown: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h18" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  moon: <path d="M20.2 15.5A9 9 0 0 1 8.5 3.8 9 9 0 1 0 20.2 15.5Z" />,
  markdown: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M5 15V9l3 3 3-3v6m5-6v6m-2-2 2 2 2-2" /></>,
  code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" /></>,
  check: <path d="m5 12 4 4L19 6" />
}
export type IconName = keyof typeof paths
export function Icon({ name, size = 16, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}>{paths[name]}</svg>
}
