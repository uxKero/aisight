import { useEffect, useState } from 'react'
import { ArrowDown2, Copy, DocumentDownload, Refresh, Share, TickCircle } from 'iconsax-reactjs'
import type { Target } from '../lib/types'
import { TargetIcon } from './BrandIcon'
import { relativeTime } from '../lib/time'
import { siX } from 'simple-icons'
import { useLang, useT } from '../lib/i18n'

export type ShareKind = 'copy' | 'save' | 'share' | 'x'

interface Props {
  targets: Target[] | null
  selected: string[]
  onToggle: (id: string) => void
  onRefresh: () => void
  onShare: (kind: ShareKind) => Promise<boolean>
}

export function SendPanel(p: Props) {
  const t = useT()
  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-chrome">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
        <h2 className="flex items-baseline gap-2 text-[14px] font-semibold">
          {t('send.to')}
          {p.selected.length > 1 && <span className="tabular text-[12.5px] font-normal text-ink-3">{t('send.selected', { n: p.selected.length })}</span>}
        </h2>
        <button
          type="button"
          aria-label={t('send.refresh')}
          title={t('send.refresh')}
          onClick={p.onRefresh}
          className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
        >
          <Refresh size={16} variant="Linear" color="currentColor" />
        </button>
      </div>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <TargetList targets={p.targets} selected={p.selected} onToggle={p.onToggle} />
      </div>

      <div className="grid shrink-0 grid-cols-4 gap-0.5 border-t border-line p-2">
        <ShareButton kind="copy" onShare={p.onShare} />
        <ShareButton kind="save" onShare={p.onShare} />
        <ShareButton kind="share" onShare={p.onShare} />
        <ShareButton kind="x" onShare={p.onShare} />
      </div>
    </aside>
  )
}

const SHARE_KEYS = {
  copy: ['share.copy', 'share.copied'],
  save: ['share.save', 'share.saved'],
  share: ['share.share', 'share.shared'],
  x: ['share.x', 'share.xDone'],
} as const

function ShareButton({ kind, onShare }: { kind: ShareKind; onShare: (k: ShareKind) => Promise<boolean> }) {
  const t = useT()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setDone(false), 1400)
    return () => clearTimeout(id)
  }, [done])
  const Icon = done ? TickCircle : kind === 'copy' ? Copy : kind === 'save' ? DocumentDownload : kind === 'x' ? XGlyph : Share
  return (
    <button
      type="button"
      onClick={async () => {
        if (await onShare(kind)) setDone(true)
      }}
      className="press flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-2 text-[12px] text-ink-2 hover:bg-hover hover:text-ink"
    >
      <Icon size={18} variant={done ? 'Bold' : 'Linear'} color={done ? 'var(--ok)' : 'currentColor'} />
      <span className="max-w-full truncate">{t(SHARE_KEYS[kind][done ? 1 : 0])}</span>
    </button>
  )
}

function XGlyph({ size = 18, color = 'currentColor' }: { size?: number; variant?: string; color?: string }) {
  return (
    <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d={siX.path} />
    </svg>
  )
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] transition-colors duration-150 ${
        on ? 'bg-primary text-primary-ink' : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]'
      }`}
      aria-hidden
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-opacity duration-150 ${on ? 'opacity-100' : 'opacity-0'}`}
      >
        <path d="M2.5 6.3 5 8.6l4.5-5" />
      </svg>
    </span>
  )
}

function TargetList({ targets, selected, onToggle }: { targets: Target[] | null; selected: string[]; onToggle: (id: string) => void }) {
  const t = useT()
  const lang = useLang()
  const [showOthers, setShowOthers] = useState(false)

  if (!targets) {
    return (
      <div className="flex flex-col gap-1 pt-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <span className="h-[30px] w-[30px] rounded-md bg-selected" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="h-3 w-3/4 rounded-sm bg-selected" />
              <span className="h-2.5 w-1/2 rounded-sm bg-hover" />
            </span>
          </div>
        ))}
      </div>
    )
  }
  if (targets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
        <p className="text-[14px] text-ink">{t('send.none')}</p>
        <p className="text-[13px] leading-snug text-ink-3">{t('send.noneHint')}</p>
      </div>
    )
  }

  const groups = [
    { key: 'orca', label: 'Orca', items: targets.filter((x) => x.host === 'orca'), fold: false },
    { key: 'apps', label: 'Apps', items: targets.filter((x) => x.host !== 'orca' && !x.other), fold: false },
    { key: 'others', label: t('send.others'), items: targets.filter((x) => x.other), fold: true },
  ].filter((g) => g.items.length)

  const detail = (x: Target) => {
    const d = x.detail === 'desktop' ? t('send.desktop') : x.detail
    return [d, x.lastActiveAt ? relativeTime(x.lastActiveAt, lang) : null].filter(Boolean).join(' · ')
  }

  return (
    <div role="listbox" aria-multiselectable="true" aria-label={t('send.to')} className="flex flex-col gap-3">
      {groups.map((g) => {
        const open = !g.fold || showOthers || g.items.some((x) => selected.includes(x.id))
        return (
          <section key={g.key} className="flex flex-col gap-0.5">
            {g.fold ? (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setShowOthers((v) => !v)}
                className="press flex items-center justify-between rounded-md px-2 py-1 text-[12.5px] font-medium text-ink-3 hover:bg-hover hover:text-ink-2"
              >
                <span>
                  {g.label} <span className="tabular font-normal">{g.items.length}</span>
                </span>
                <ArrowDown2 size={14} variant="Linear" color="currentColor" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <h3 className="px-2 pb-1 text-[12.5px] font-medium text-ink-3">{g.label}</h3>
            )}
            {open &&
              g.items.map((x) => {
                const sel = selected.includes(x.id)
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    onClick={() => onToggle(x.id)}
                    className={`press group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left ${sel ? 'bg-selected' : 'hover:bg-hover'}`}
                  >
                    <TargetIcon host={x.host} agent={x.agent} size={30} label={x.detail ?? x.title} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`truncate text-[14px] ${sel ? 'font-medium text-ink' : 'text-ink-2 group-hover:text-ink'}`}>{x.title}</span>
                      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-3">
                        {x.busy && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#F5A100]" aria-label={t('send.busy')} />}
                        <span className="truncate">{detail(x)}</span>
                      </span>
                    </span>
                    <Check on={sel} />
                  </button>
                )
              })}
          </section>
        )
      })}
    </div>
  )
}
