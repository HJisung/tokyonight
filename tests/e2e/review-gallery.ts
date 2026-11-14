import { chromium } from '@playwright/test'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

/** 테마/엔진별 캡처를 4장씩 나란히 놓은 검토용 페이지의 스크린샷. 원본 PNG는 보존한다. */
export default async function reviewGallery() {
  const dir = resolve('tests/e2e/screenshots')
  await mkdir(dir, { recursive: true })
  const files = (await readdir(dir)).filter((name) => /^(chromium|webkit)-(dark|light)-\d+/.test(name)).sort()
  if (!files.length) return
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    for (const project of ['chromium-dark', 'chromium-light', 'webkit-dark', 'webkit-light']) {
      const images = files.filter((name) => name.startsWith(project + '-'))
      for (let i = 0; i < images.length; i += 4) {
        const cards = await Promise.all(images.slice(i, i + 4).map(async (name) => {
          const data = await readFile(resolve(dir, name))
          return `<figure><figcaption>${name}</figcaption><img src="data:image/png;base64,${data.toString('base64')}"></figure>`
        }))
        await page.setContent(`<html><head><style>body{margin:0;padding:12px;background:#ddd;display:grid;grid-template-columns:1fr 1fr;gap:12px;font:12px system-ui}figure{margin:0;min-width:0}figcaption{padding:6px;background:white}img{display:block;width:100%;height:436px;object-fit:contain;object-position:top;background:#bbb}</style></head><body>${cards.join('')}</body></html>`)
        await page.locator('img').evaluateAll((imgs) => Promise.all(imgs.map((img) => (img as HTMLImageElement).decode())))
        await page.screenshot({ path: resolve(dir, `review-${project}-${1 + i / 4}.png`), fullPage: true })
      }
    }
  } finally { await browser.close() }
}
