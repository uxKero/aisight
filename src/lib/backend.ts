import type { Capture, DeliverRequest, Settings, Target } from './types'

export type RenderKind = 'agent' | 'share'

export interface DeliverResult {
  id: string
  error: string | null
}

export interface Backend {
  onCapture(cb: (capture: Capture) => void): () => void
  listTargets(): Promise<Target[]>
  deliver(req: DeliverRequest): Promise<DeliverResult[]>
  saveRender(captureId: string, png: Uint8Array, kind: RenderKind): Promise<string>
  saveRecord(capture: Capture): Promise<void>
  history(): Promise<Capture[]>
  imageUrl(path: string): string
  startCapture(): Promise<void>
  hide(): Promise<void>
  minimize(): Promise<void>
  toggleMaximize(): Promise<boolean>
  onResized(cb: (maximized: boolean) => void): () => void
  copyImage(paths: string[]): Promise<void>
  saveAs(paths: string[], suggestedName: string): Promise<string | null>
  share(paths: string[], title: string): Promise<void>
  reveal(path: string): Promise<void>
  openFolder(): Promise<void>
  pickFolder(current: string): Promise<string | null>
  getSettings(): Promise<Settings>
  setSettings(next: Settings): Promise<Settings>
  setBackground(color: string): Promise<void>
  setGlass(dark: boolean): Promise<void>
  clipboardText(): Promise<string | null>
  openUrl(url: string): Promise<void>
  postToX(paths: string[], text: string): Promise<'pasted' | 'clipboard'>
}

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  language: 'en',
  shortcut: 'Alt+Shift+S',
  primary: 'attach',
  followOnAttach: true,
  contextApp: true,
  contextTitle: true,
  contextUrl: true,
  folder: 'C:/Users/you/Pictures/AISight',
  autostart: false,
  captureTool: 'aisight',
  templates: ['Fix what I marked', "What's wrong here?", 'Make it look exactly like this', 'This error shows up when I do this:'],
}

async function tauriBackend(): Promise<Backend> {
  const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')
  const { getCurrentWindow, Effect } = await import('@tauri-apps/api/window')
  const dialog = await import('@tauri-apps/plugin-dialog')
  const pathApi = await import('@tauri-apps/api/path')
  const win = getCurrentWindow()
  return {
    onCapture(cb) {
      let off: (() => void) | undefined
      let cancelled = false
      listen<Capture>('capture', (e) => cb(e.payload)).then((u) => {
        if (cancelled) u()
        else off = u
      })
      return () => {
        cancelled = true
        off?.()
      }
    },
    listTargets: () => invoke<Target[]>('list_targets'),
    deliver: (req) => invoke<DeliverResult[]>('deliver', { req }),
    saveRender: (captureId, png, kind) => invoke<string>('save_render', { captureId, png: Array.from(png), kind }),
    saveRecord: (capture) => invoke('save_record', { capture }),
    history: () => invoke<Capture[]>('history'),
    imageUrl: (path) => convertFileSrc(path),
    startCapture: () => invoke('start_capture'),
    hide: () => invoke('hide_panel'),
    minimize: () => win.minimize(),
    toggleMaximize: async () => {
      await win.toggleMaximize()
      return win.isMaximized()
    },
    onResized(cb) {
      let off: (() => void) | undefined
      let cancelled = false
      win.onResized(async () => cb(await win.isMaximized())).then((u) => {
        if (cancelled) u()
        else off = u
      })
      return () => {
        cancelled = true
        off?.()
      }
    },
    copyImage: (paths) => invoke('copy_image', { paths }),
    async saveAs(paths, suggestedName) {
      let dir: string | null = null
      try {
        dir = localStorage.getItem('aisight:save-dir')
      } catch {}
      if (!dir) dir = await pathApi.downloadDir().catch(() => null)
      if (paths.length > 1) {
        const picked = await dialog.open({ directory: true, defaultPath: dir ?? undefined })
        if (typeof picked !== 'string') return null
        const base = suggestedName.replace(/\.png$/, '')
        for (const [i, from] of paths.entries()) await invoke('copy_file', { from, to: await pathApi.join(picked, `${base}-${i + 1}.png`) })
        try {
          localStorage.setItem('aisight:save-dir', picked)
        } catch {}
        return picked
      }
      const defaultPath = dir ? await pathApi.join(dir, suggestedName) : suggestedName
      const to = await dialog.save({ defaultPath, filters: [{ name: 'PNG', extensions: ['png'] }] })
      if (!to) return null
      await invoke('copy_file', { from: paths[0], to })
      try {
        localStorage.setItem('aisight:save-dir', await pathApi.dirname(to))
      } catch {}
      return to
    },
    share: (paths, title) => invoke('share', { paths, title }),
    reveal: (path) => invoke('reveal', { path }),
    openFolder: () => invoke('open_folder'),
    async pickFolder(current) {
      const picked = await dialog.open({ directory: true, defaultPath: current })
      return typeof picked === 'string' ? picked.replace(/\\/g, '/') : null
    },
    getSettings: () => invoke<Settings>('get_settings'),
    setSettings: (next) => invoke<Settings>('set_settings', { next }),
    setBackground: async (color) => {
      const hex = color.replace('#', '')
      const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
      await win.setBackgroundColor([rgb[0], rgb[1], rgb[2], 255])
    },
    setGlass: (dark) => win.setEffects({ effects: [dark ? Effect.TabbedDark : Effect.TabbedLight] }),
    clipboardText: () => invoke<string | null>('clipboard_text'),
    openUrl: (url) => invoke('open_url', { url }),
    postToX: (paths, text) => invoke<'pasted' | 'clipboard'>('post_to_x', { paths, text }),
  }
}

function mockBackend(): Backend {
  const now = Date.now()
  const demo = true
  const demoTargets: Target[] = [
    { id: 'd1', host: 'orca', agent: 'claude', title: 'Checkout redesign', detail: 'storefront · feat/checkout', delivery: 'orca', handle: 'd1', lastActiveAt: now - 20_000, busy: true },
    { id: 'd2', host: 'orca', agent: 'codex', title: 'Fix flaky auth tests', detail: 'api · fix/auth-timeouts', delivery: 'orca', handle: 'd2', lastActiveAt: now - 4 * 60_000 },
    { id: 'd3', host: 'orca', agent: 'claude', title: 'Landing hero animation', detail: 'marketing-site', delivery: 'orca', handle: 'd3', lastActiveAt: now - 50 * 60_000 },
    { id: 'd4', host: 'orca', agent: 'codex', title: 'Migrate to Postgres 17', detail: 'infra · chore/pg17', delivery: 'orca', handle: 'd4', lastActiveAt: now - 3 * 3_600_000 },
    { id: 'd5', host: 'antigravity', title: 'Antigravity', detail: 'storefront', delivery: 'paste-image', handle: 'd5' },
    { id: 'd6', host: 'cursor', title: 'Cursor', detail: 'desktop', delivery: 'paste-image', handle: 'd6' },
    { id: 'd7', host: 'grok', title: 'Grok Bot', detail: 'desktop', delivery: 'paste-image', handle: 'd7' },
    { id: 'd8', host: 'whatsapp', title: 'WhatsApp', detail: 'desktop', delivery: 'paste-image', handle: 'd8' },
    { id: 'd9', host: 'app', title: 'Northwind design system', detail: 'Figma', delivery: 'paste-image', handle: 'd9', other: true },
    { id: 'd10', host: 'app', title: '#product-team', detail: 'Slack', delivery: 'paste-image', handle: 'd10', other: true },
    { id: 'd11', host: 'app', title: 'Sprint 42', detail: 'Linear', delivery: 'paste-image', handle: 'd11', other: true },
    { id: 'd12', host: 'app', title: 'Focus Flow', detail: 'Spotify', delivery: 'paste-image', handle: 'd12', other: true },
  ]
  const targets: Target[] = demoTargets
  const sample: Capture = {
    id: 'dev',
    path: '/demo-capture-1.png',
    width: 1280,
    height: 760,
    createdAt: now,
    source: { app: 'Chrome', exe: 'chrome.exe', title: 'Northwind · Overview', url: 'https://app.northwind.example/overview' },
    marks: [],
    message: '',
    sentTo: [],
  }
  let settings = { ...DEFAULT_SETTINGS }
  const history: Capture[] = [
    sample,
    {
      ...sample,
      id: 'h1',
      createdAt: now - 3_600_000,
      path: '/demo-capture-2.png',
      source: { app: 'Chrome', exe: 'chrome.exe', title: 'Northwind · Settings', url: 'https://app.northwind.example/settings' },
      marks: [{ id: 'm', n: 1, x: 0.18, y: 0.62, w: 0.34, h: 0.23, note: 'Toggles feel cramped', color: '#2F6BFF' }],
      message: 'Fix what I marked',
      sentTo: [{ targetTitle: 'Checkout redesign', host: 'orca', agent: 'claude', at: now - 3_500_000, submitted: true }],
    },
  ]
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  return {
    onCapture(cb) {
      const t = setTimeout(() => cb(sample), 50)
      const t2 = demo
        ? setTimeout(
            () =>
              cb({
                ...sample,
                id: 'dev2',
                path: '/demo-capture-2.png',
                createdAt: now + 1,
                source: { app: 'Chrome', exe: 'chrome.exe', title: 'Northwind · Settings', url: 'https://app.northwind.example/settings' },
              }),
            120,
          )
        : undefined
      return () => {
        clearTimeout(t)
        if (t2) clearTimeout(t2)
      }
    },
    listTargets: async () => {
      await wait(250)
      return targets
    },
    deliver: async (req) => {
      await wait(450)
      console.info('[aisight] deliver', req)
      return req.targets.map((t) => ({ id: t.id, error: null }))
    },
    saveRender: async (id, _png, kind) => `C:/mock/${id}-${kind}.png`,
    saveRecord: async () => {},
    history: async () => history,
    imageUrl: (path) => path,
    startCapture: async () => {},
    hide: async () => {},
    minimize: async () => {},
    toggleMaximize: async () => false,
    onResized: () => () => {},
    copyImage: async () => wait(150),
    saveAs: async (_p, name) => `C:/Users/you/Desktop/${name}`,
    share: async () => wait(150),
    reveal: async () => {},
    openFolder: async () => {},
    pickFolder: async (current) => current,
    getSettings: async () => settings,
    setSettings: async (next) => {
      settings = next
      return next
    },
    setBackground: async () => {},
    setGlass: async () => {},
    openUrl: async (url) => {
      window.open(url, '_blank')
    },
    postToX: async () => 'pasted',
    clipboardText: async () => 'TypeError: Cannot read properties of undefined (reading map)\n    at Comercios (comercios.tsx:42)',
  }
}

export const backendPromise: Promise<Backend> = isTauri ? tauriBackend() : Promise.resolve(mockBackend())
