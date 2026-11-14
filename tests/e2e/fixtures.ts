import { test as base, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { FakeBackend } from './fake-backend'

interface MockInternals {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>
  transformCallback(callback: (value: unknown) => unknown, once?: boolean): number
  unregisterCallback(id: number): void
  metadata: { currentWindow: { label: string }; currentWebview: { label: string } }
}
declare global {
  interface Window {
    __mockInvoke(command: string, args: Record<string, unknown>): Promise<unknown>
    __mockEmit(event: string, payload?: unknown): Promise<void>
    __TAURI_INTERNALS__: MockInternals
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener(event: string, id: number): void }
  }
}

export async function emit(page: Page, event: string, payload?: unknown) {
  await page.evaluate(({ event, payload }) => window.__mockEmit(event, payload), { event, payload })
}
export async function shot(page: Page, name: string) {
  await mkdir('tests/e2e/screenshots', { recursive: true })
  await page.screenshot({ path: `tests/e2e/screenshots/${name}.png`, fullPage: true, animations: 'disabled' })
}

export const test = base.extend<{ backend: FakeBackend; consoleErrors: string[] }>({
  backend: async ({ page }, use) => {
    const backend = new FakeBackend()
    await page.exposeBinding('__mockInvoke', (_source, command: string, args: Record<string, unknown>) => backend.invoke(command, args))
    await page.addInitScript(() => {
      let serial = 0
      const callbacks = new Map<number, (value: unknown) => unknown>()
      const listeners = new Map<number, { event: string; callback: number }>()
      window.__mockEmit = async (event, payload) => {
        for (const [id, listener] of [...listeners]) {
          if (listener.event === event) await callbacks.get(listener.callback)?.({ event, id, payload })
        }
      }
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback(callback, once = false) {
          const id = ++serial
          callbacks.set(id, (value) => { if (once) callbacks.delete(id); return callback(value) })
          return id
        },
        unregisterCallback(id) { callbacks.delete(id) },
        async invoke(command, args = {}) {
          if (command === 'plugin:event|listen') {
            const id = ++serial
            listeners.set(id, { event: args.event as string, callback: args.handler as number })
            return id
          }
          if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId as number); return null }
          if (command === 'plugin:event|emit' || command === 'plugin:event|emit_to') { await window.__mockEmit(args.event as string, args.payload); return null }
          return window.__mockInvoke(command, args)
        }
      }
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener(_event, id) { listeners.delete(id) } }
    })
    await use(backend)
  },
  consoleErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await use(errors)
    expect(errors, '브라우저 콘솔/런타임 오류').toEqual([])
  }, { auto: true }]
})
export { expect }
