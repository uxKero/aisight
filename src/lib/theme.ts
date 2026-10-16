import { isTauri, type Backend } from './backend'
import type { Theme } from './types'

const query = '(prefers-color-scheme: dark)'

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia(query).matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme, backend: Backend) {
  const resolved = resolveTheme(theme)
  const root = document.documentElement
  root.dataset.theme = resolved
  if (isTauri) {
    root.dataset.glass = 'true'
    backend.setGlass(resolved === 'dark').catch(() => {})
  }
}

export function watchSystemTheme(cb: () => void): () => void {
  const mq = window.matchMedia(query)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
