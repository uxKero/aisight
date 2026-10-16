import { useEffect, useState } from 'react'
import { Gallery, Refresh2 } from 'iconsax-reactjs'
import type { Capture } from '../lib/types'
import { TargetIcon } from './BrandIcon'
import { stamp } from '../lib/time'
import { inkOn } from '../lib/compose'
import { useLang, useT } from '../lib/i18n'

interface Props {
  items: Capture[] | null
  imageUrl: (path: string) => string
  onReuse: (c: Capture) => void
}

export function History({ items, imageUrl, onReuse }: Props) {
  const t = useT()
  const lang = useLang()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (items?.length && !items.some((c) => c.id === selectedId)) setSelectedId(items[0].id)
  }, [items, selectedId])

  if (!items) return null

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Gallery size={30} variant="Linear" color="var(--ink-3)" />
        <p className="text-[14.5px] text-ink-2">{t('history.empty')}</p>
      </div>
    )
  }

  const current = items.find((c) => c.id === selectedId) ?? items[0]
  const notes = current.marks.filter((m) => m.note.trim())

  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_340px]">
      <div className="flex min-h-0 flex-col">
        <div className="stage flex min-h-0 flex-1 items-center justify-center p-8">
          <img src={imageUrl(current.path)} alt="" className="image-frame max-h-full max-w-full rounded-[3px] object-contain" />
        </div>
        <div className="scroll-quiet flex shrink-0 gap-2 overflow-x-auto border-t border-line bg-chrome p-3">
          {items.map((c) => {
            const sel = c.id === current.id
            return (
              <button
                key={c.id}
                type="button"
                aria-label={t('history.capture', { when: stamp(c.createdAt, lang) })}
                aria-pressed={sel}
                onClick={() => setSelectedId(c.id)}
                className={`press relative h-[60px] w-[100px] shrink-0 overflow-hidden rounded-[4px] ${
                  sel ? 'opacity-100 shadow-[0_0_0_2px_var(--ink)]' : 'opacity-55 shadow-[0_0_0_1px_var(--line-strong)] hover:opacity-85'
                }`}
              >
                <img src={imageUrl(c.path)} alt="" className="h-full w-full object-cover" />
              </button>
            )
          })}
        </div>
      </div>

      <aside className="scroll-quiet flex min-h-0 flex-col gap-6 overflow-y-auto border-l border-line bg-chrome p-4">
        <div className="flex flex-col gap-1">
          <span className="tabular text-[12.5px] text-ink-3">{stamp(current.createdAt, lang)}</span>
          <span className="text-[15px] leading-snug font-medium text-ink">{current.source.title || current.source.app || t('history.untitled')}</span>
          {current.source.url && <span className="truncate font-mono text-[12.5px] text-ink-3">{current.source.url}</span>}
        </div>

        {(current.message || notes.length > 0) && (
          <div className="flex flex-col gap-2 text-[14px] leading-relaxed text-ink-2">
            {current.message && <p className="whitespace-pre-wrap">{current.message}</p>}
            {notes.map((m) => (
              <p key={m.id} className="flex items-start gap-2">
                <span
                  className="tabular mt-[3px] flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-[3px] text-[10.5px] font-bold"
                  style={{ background: m.color || '#FF5A36', color: inkOn(m.color || '#FF5A36') }}
                >
                  {m.n}
                </span>
                <span>{m.note}</span>
              </p>
            ))}
          </div>
        )}

        {current.sentTo.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-[12.5px] font-medium text-ink-3">{t('history.sentTo')}</h3>
            {current.sentTo.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <TargetIcon host={s.host} agent={s.agent} size={24} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-2">{s.targetTitle}</span>
                <span className="text-[12.5px] text-ink-3">{s.submitted ? t('history.sent') : t('history.attached')}</span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => onReuse(current)}
          className="press mt-auto flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-ink hover:opacity-90"
        >
          <Refresh2 size={17} variant="Linear" color="currentColor" />
          {t('history.reuse')}
        </button>
      </aside>
    </div>
  )
}
