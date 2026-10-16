import type { ComponentType, CSSProperties } from 'react'
import ClaudeColor from '@lobehub/icons/es/Claude/components/Color'
import CodexColor from '@lobehub/icons/es/Codex/components/Color'
import AntigravityColor from '@lobehub/icons/es/Antigravity/components/Color'
import GeminiColor from '@lobehub/icons/es/Gemini/components/Color'
import GrokMono from '@lobehub/icons/es/Grok/components/Mono'
import CursorMono from '@lobehub/icons/es/Cursor/components/Mono'
import CopilotMono from '@lobehub/icons/es/GithubCopilot/components/Mono'
import OpenCodeMono from '@lobehub/icons/es/OpenCode/components/Mono'
import OpenAIMono from '@lobehub/icons/es/OpenAI/components/Mono'
import { Global, Monitor } from 'iconsax-reactjs'
import { siWhatsapp, siX } from 'simple-icons'
import type { Brand } from '../lib/types'
import { ORCA_PATH } from './orcaPath'

type SvgIcon = ComponentType<{ size?: number | string; style?: CSSProperties; color?: string }>

function OrcaLogo({ size = 16 }: { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 318.6 202.67" fill="#fff" aria-hidden>
      <path transform="translate(-6.667,-70.667)" d={ORCA_PATH} />
    </svg>
  )
}

function SimpleIcon({ path, size, color }: { path: string; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d={path} />
    </svg>
  )
}

interface BrandSpec {
  label: string
  tile: string
  render: (size: number) => React.ReactNode
}

const mono = (Icon: SvgIcon, color = '#fff') => (size: number) => <Icon size={size} color={color} style={{ color }} />
const color = (Icon: SvgIcon) => (size: number) => <Icon size={size} />

export const BRANDS: Record<Brand, BrandSpec> = {
  orca: { label: 'Orca', tile: '#0b0b0c', render: (s) => <OrcaLogo size={s * 1.05} /> },
  claude: { label: 'Claude', tile: '#2a1a14', render: color(ClaudeColor) },
  codex: { label: 'Codex', tile: '#f4f4f5', render: color(CodexColor) },
  antigravity: { label: 'Antigravity', tile: '#f4f4f5', render: color(AntigravityColor) },
  gemini: { label: 'Gemini', tile: '#141824', render: color(GeminiColor) },
  grok: { label: 'Grok', tile: '#000', render: mono(GrokMono) },
  cursor: { label: 'Cursor', tile: '#000', render: mono(CursorMono) },
  copilot: { label: 'Copilot', tile: '#0d1117', render: mono(CopilotMono) },
  opencode: { label: 'OpenCode', tile: '#111', render: mono(OpenCodeMono) },
  chatgpt: { label: 'ChatGPT', tile: '#0f0f0f', render: mono(OpenAIMono) },
  terminal: { label: 'Terminal', tile: '#1c1d21', render: (s) => <Monitor size={s} color="#d4d4d8" variant="Linear" /> },
  browser: { label: 'Navegador', tile: '#1c1d21', render: (s) => <Global size={s} color="#d4d4d8" variant="Linear" /> },
  whatsapp: { label: 'WhatsApp', tile: '#25D366', render: (s) => <SimpleIcon path={siWhatsapp.path} size={s} color="#fff" /> },
  x: { label: 'X', tile: '#000', render: (s) => <SimpleIcon path={siX.path} size={s * 0.85} color="#fff" /> },
  app: { label: 'App', tile: 'var(--selected)', render: (s) => <Monitor size={s} color="var(--ink-2)" variant="Linear" /> },
}

export function BrandTile({ brand, size = 36 }: { brand: Brand; size?: number }) {
  const spec = BRANDS[brand]
  return (
    <span
      className="brand-tile"
      style={{ width: size, height: size, background: spec.tile, borderRadius: size * 0.28 }}
      aria-hidden
    >
      {spec.render(Math.round(size * 0.56))}
    </span>
  )
}

function LetterTile({ label, size }: { label: string; size: number }) {
  const letter = label.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      className="brand-tile font-semibold text-ink-2"
      style={{ width: size, height: size, borderRadius: size * 0.28, background: 'var(--selected)', fontSize: size * 0.44 }}
      aria-hidden
    >
      {letter}
    </span>
  )
}

export function TargetIcon({ host, agent, size = 36, label }: { host: Brand; agent?: Brand; size?: number; label?: string }) {
  if (host === 'app' && label) return <LetterTile label={label} size={size} />
  if (!agent || agent === host) return <BrandTile brand={host} size={size} />
  const badge = Math.round(size * 0.56)
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <BrandTile brand={host} size={size} />
      <span className="target-badge" style={{ right: -badge * 0.28, bottom: -badge * 0.28 }}>
        <BrandTile brand={agent} size={badge} />
      </span>
    </span>
  )
}
