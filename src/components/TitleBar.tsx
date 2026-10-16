import { motion } from 'motion/react'
import { Setting2 } from 'iconsax-reactjs'
import { Logo, LogoMark } from './Logo'
import { useT } from '../lib/i18n'

export type View = 'capture' | 'history'

interface Props {
  view: View
  onView: (v: View) => void
  settingsOpen: boolean
  shortcut: string
  onNewCapture: () => void
  onSettings: () => void
  onMinimize: () => void
  maximized: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

export function TitleBar({ view, onView, settingsOpen, shortcut, onNewCapture, onSettings, onMinimize, maximized, onToggleMaximize, onClose }: Props) {
  const t = useT()
  return (
    <header data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-chrome pl-4">
      <Logo />
      <nav className="flex items-center gap-0.5 rounded-md bg-selected p-0.5" aria-label="Vistas">
        {(['capture', 'history'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-pressed={view === v}
            className={`press relative rounded-[5px] px-3 py-[3px] text-[13.5px] ${view === v ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
          >
            {view === v && (
              <motion.span
                layoutId="view-pill"
                className="absolute inset-0 rounded-[5px] bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
                transition={{ type: 'spring', duration: 0.28, bounce: 0.12 }}
              />
            )}
            <span className="relative">{v === 'capture' ? t('tab.capture') : t('tab.history')}</span>
          </button>
        ))}
      </nav>
      <div data-tauri-drag-region className="h-full flex-1" />
      <div className="flex h-full items-center">
        <button
          type="button"
          onClick={onNewCapture}
          title={`${t('title.newCapture')}  ·  ${shortcut.split('+').join(' + ')}`}
          className="press mr-1.5 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
        >
          <LogoMark size={16} tile={false} />
          {t('title.newCapture')}
        </button>
        <button
          type="button"
          aria-label={t('title.settings')}
          aria-pressed={settingsOpen}
          onClick={onSettings}
          className={`press mr-2 flex h-8 w-8 items-center justify-center rounded-md ${settingsOpen ? 'bg-selected text-ink' : 'text-ink-3 hover:bg-hover hover:text-ink'}`}
        >
          <Setting2 size={18} variant="Linear" color="currentColor" />
        </button>
        <WindowButton label={t('title.minimize')} onClick={onMinimize}>
          <path d="M1 5.5h9" />
        </WindowButton>
        <WindowButton label={maximized ? t('title.restore') : t('title.maximize')} onClick={onToggleMaximize}>
          {maximized ? (
            <>
              <rect x="1" y="3" width="7" height="7" rx="0.5" />
              <path d="M3 3V1.5A.5.5 0 0 1 3.5 1H9.5a.5.5 0 0 1 .5.5V7.5a.5.5 0 0 1-.5.5H8" />
            </>
          ) : (
            <rect x="1" y="1" width="9" height="9" rx="0.5" />
          )}
        </WindowButton>
        <WindowButton label={t('title.close')} onClick={onClose} danger>
          <path d="M1 1l9 9M10 1l-9 9" />
        </WindowButton>
      </div>
    </header>
  )
}

function WindowButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-full w-[46px] items-center justify-center text-ink-2 transition-colors duration-100 ${
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-hover hover:text-ink'
      }`}
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden>
        {children}
      </svg>
    </button>
  )
}
