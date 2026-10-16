import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Add, FolderOpen, Keyboard, Moon, Monitor, Sun1, Trash } from 'iconsax-reactjs'
import type { Settings, Theme } from '../lib/types'
import { useT } from '../lib/i18n'
import { siGithub, siX } from 'simple-icons'

export const LINKS = { x: 'https://x.com/uxKero', github: 'https://github.com/uxKero/aisight' }

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => Promise<string | null>
  onOpenFolder: () => void
  onPickFolder: () => void
  onOpenUrl: (url: string) => void
}

export function SettingsModal({ open, onClose, ...rest }: Props & { open: boolean; onClose: () => void }) {
  const t = useT()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-x-0 top-11 bottom-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgb(20 18 16 / 0.16)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.14 } }}
          transition={{ duration: 0.18 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-label={t('title.settings')}
            className="floating flex max-h-full w-full max-w-[600px] flex-col overflow-hidden rounded-lg"
            initial={{ opacity: 0, transform: 'scale(0.97) translateY(6px)' }}
            animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
            exit={{ opacity: 0, transform: 'scale(0.98)', transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex h-12 shrink-0 items-center border-b border-line pr-2 pl-5">
              <h2 className="text-[15px] font-semibold">{t('title.settings')}</h2>
              <div className="ml-auto flex items-center gap-0.5 pr-1">
                <button
                  type="button"
                  onClick={() => rest.onOpenUrl(LINKS.x)}
                  title="@uxKero"
                  className="press flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
                >
                  {t('set.by')}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d={siX.path} />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={t('set.github')}
                  title={t('set.github')}
                  onClick={() => rest.onOpenUrl(LINKS.github)}
                  className="press flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d={siGithub.path} />
                  </svg>
                </button>
                <span className="mx-1 h-5 w-px bg-line" />
              </div>
              <button type="button" aria-label={t('set.close')} onClick={onClose} className="press flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                  <path d="M1 1l9 9M10 1l-9 9" />
                </svg>
              </button>
            </div>
            <SettingsView {...rest} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SettingsView({ settings, onChange, onOpenFolder, onPickFolder }: Omit<Props, 'onOpenUrl'>) {
  const t = useT()
  return (
    <div className="scroll-quiet min-h-0 overflow-y-auto bg-sunken">
      <div className="flex flex-col gap-7 px-5 py-6">
        <Section title={t('set.appearance')}>
          <Row label={t('set.language')}>
            <Segmented<Settings['language']>
              value={settings.language}
              onChange={(language) => onChange({ language })}
              options={[
                { value: 'en', label: 'English' },
                { value: 'es', label: 'Español' },
                { value: 'zh', label: '中文' },
              ]}
            />
          </Row>
          <Row label={t('set.theme')}>
            <Segmented<Theme>
              value={settings.theme}
              onChange={(theme) => onChange({ theme })}
              options={[
                { value: 'light', label: t('set.light'), icon: <Sun1 size={16} variant="Linear" color="currentColor" /> },
                { value: 'dark', label: t('set.dark'), icon: <Moon size={16} variant="Linear" color="currentColor" /> },
                { value: 'system', label: t('set.system'), icon: <Monitor size={16} variant="Linear" color="currentColor" /> },
              ]}
            />
          </Row>
        </Section>

        <Section title={t('set.capture')}>
          <Row label={t('set.tool')}>
            <Segmented<Settings['captureTool']>
              value={settings.captureTool ?? 'aisight'}
              onChange={(captureTool) => onChange({ captureTool })}
              options={[
                { value: 'aisight', label: 'AISight' },
                { value: 'windows', label: t('set.toolWindows') },
              ]}
            />
          </Row>
          <Row label={t('set.shortcut')}>
            <ShortcutRecorder value={settings.shortcut} onChange={(shortcut) => onChange({ shortcut })} />
          </Row>
          <Row label={t('set.folder')} stacked>
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded-md bg-selected px-2.5 py-1.5 font-mono text-[12.5px] text-ink-2">{settings.folder}</span>
              <button type="button" onClick={onOpenFolder} className="press flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13.5px] text-ink-2 hover:bg-hover hover:text-ink">
                <FolderOpen size={16} variant="Linear" color="currentColor" />
                {t('set.open')}
              </button>
              <button type="button" onClick={onPickFolder} className="press rounded-md bg-selected px-2.5 py-1.5 text-[13.5px] text-ink hover:bg-line-strong">
                {t('set.change')}
              </button>
            </div>
          </Row>
        </Section>

        <Section title={t('set.sending')}>
          <Row label={t('set.primary')}>
            <Segmented<'attach' | 'send'>
              value={settings.primary}
              onChange={(primary) => onChange({ primary })}
              options={[
                { value: 'attach', label: t('send.attach') },
                { value: 'send', label: t('send.send') },
              ]}
            />
          </Row>
          <Row label={t('set.follow')}>
            <Toggle on={settings.followOnAttach} onChange={(followOnAttach) => onChange({ followOnAttach })} />
          </Row>
        </Section>

        <Section title={t('set.templates')}>
          <Templates items={settings.templates} onChange={(templates) => onChange({ templates })} />
        </Section>

        <Section title={t('set.context')}>
          <Row label={t('set.ctxApp')}>
            <Toggle on={settings.contextApp} onChange={(contextApp) => onChange({ contextApp })} />
          </Row>
          <Row label={t('set.ctxTitle')}>
            <Toggle on={settings.contextTitle} onChange={(contextTitle) => onChange({ contextTitle })} />
          </Row>
          <Row label={t('set.ctxUrl')}>
            <Toggle on={settings.contextUrl} onChange={(contextUrl) => onChange({ contextUrl })} />
          </Row>
        </Section>

        <Section title={t('set.system2')}>
          <Row label={t('set.autostart')}>
            <Toggle on={settings.autostart} onChange={(autostart) => onChange({ autostart })} />
          </Row>
        </Section>
      </div>
    </div>
  )
}

function Templates({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim()
    if (!t) return
    onChange([...items, t])
    setDraft('')
  }
  return (
    <>
      {items.map((tpl, i) => (
        <div key={`${i}-${tpl}`} className="group flex items-center gap-3 px-4 py-2.5">
          <span className="w-4 shrink-0 text-[13px] text-ink-3">/</span>
          <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{tpl}</span>
          <button
            type="button"
            aria-label={t('set.removeTemplate')}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100"
          >
            <Trash size={15} variant="Linear" color="currentColor" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3 px-4 py-2">
        <Add size={16} variant="Linear" color="var(--ink-3)" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder={t('set.newTemplate')}
          className="min-w-0 flex-1 py-1 text-[14px] placeholder:text-ink-3"
        />
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-[13px] font-medium text-ink-3">{title}</h2>
      <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">{children}</div>
    </section>
  )
}

function Row({ label, children, stacked }: { label: string; children: React.ReactNode; stacked?: boolean }) {
  return (
    <div className={`flex gap-4 px-4 py-3 ${stacked ? 'flex-col items-stretch gap-2.5' : 'items-center justify-between'}`}>
      <span className="text-[14px] text-ink">{label}</span>
      {children}
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150 ${on ? 'bg-primary' : 'bg-line-strong'}`}
    >
      <span
        className="absolute top-[3px] left-[3px] h-[16px] w-[16px] rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-[var(--ease-out)]"
        style={{ transform: on ? 'translateX(16px)' : 'translateX(0px)' }}
      />
    </button>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: React.ReactNode }[]
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-selected p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`press relative flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[13.5px] ${value === o.value ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${options.map((x) => x.value).join('-')}`}
              className="absolute inset-0 rounded-[5px] bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
              transition={{ type: 'spring', duration: 0.28, bounce: 0.12 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  )
}

const MOD_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

function keyName(e: KeyboardEvent): string | null {
  if (MOD_KEYS.has(e.key)) return null
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3)
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) return e.code
  const map: Record<string, string> = { Space: 'Space', PrintScreen: 'PrintScreen', Backquote: '`', Minus: '-', Equal: '=' }
  return map[e.code] ?? null
}

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (v: string) => Promise<string | null> }) {
  const t = useT()
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!recording) return
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(false)
        return
      }
      const key = keyName(e)
      if (!key) return
      const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean)
      if (mods.length === 0 && !/^F\d+$|^PrintScreen$/.test(key)) {
        setError(t('set.needMod'))
        return
      }
      setRecording(false)
      const err = await onChange([...mods, key].join('+'))
      setError(err)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, onChange, t])

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setError(null)
          setRecording((r) => !r)
        }}
        className={`press flex min-w-[150px] items-center justify-center gap-2 rounded-md px-3 py-1.5 text-[13.5px] ${
          recording ? 'bg-primary text-primary-ink' : 'bg-selected text-ink hover:bg-line-strong'
        }`}
      >
        <Keyboard size={16} variant="Linear" color="currentColor" />
        {recording ? t('set.recording') : value.split('+').join(' + ')}
      </button>
      {error && <span className="text-[12.5px] text-bad">{error}</span>}
    </div>
  )
}
