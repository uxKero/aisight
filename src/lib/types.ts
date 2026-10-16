export type Brand =
  | 'orca'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'gemini'
  | 'grok'
  | 'cursor'
  | 'copilot'
  | 'opencode'
  | 'chatgpt'
  | 'terminal'
  | 'browser'
  | 'app'
  | 'whatsapp'
  | 'x'

export type Delivery = 'orca' | 'orca-at' | 'paste-image' | 'paste-path' | 'at-path'

export interface Target {
  id: string
  host: Brand
  agent?: Brand
  title: string
  detail?: string
  delivery: Delivery
  handle: string
  lastActiveAt?: number
  busy?: boolean
  other?: boolean
}

export interface SourceContext {
  app?: string
  exe?: string
  title?: string
  url?: string
}

export interface Mark {
  id: string
  n: number
  x: number
  y: number
  w: number
  h: number
  note: string
  color: string
}

export interface Capture {
  id: string
  path: string
  width: number
  height: number
  createdAt: number
  source: SourceContext
  marks: Mark[]
  message: string
  sentTo: SentRecord[]
}

export interface SentRecord {
  targetTitle: string
  host: Brand
  agent?: Brand
  at: number
  submitted: boolean
}

export interface DeliverRequest {
  targets: Target[]
  imagePaths: string[]
  text: string
  submit: boolean
}

export type Theme = 'light' | 'dark' | 'system'

export interface Settings {
  theme: Theme
  language: 'en' | 'es' | 'zh'
  shortcut: string
  primary: 'attach' | 'send'
  followOnAttach: boolean
  contextApp: boolean
  contextTitle: boolean
  contextUrl: boolean
  folder: string
  autostart: boolean
  templates: string[]
  captureTool: 'aisight' | 'windows'
}

export interface ContextToggles {
  app: boolean
  title: boolean
  url: boolean
}
