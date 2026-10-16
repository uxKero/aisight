import { AnimatePresence, motion } from 'motion/react'
import { Add } from 'iconsax-reactjs'
import { useT } from '../lib/i18n'

export interface RailItem {
  id: string
  src: string
  marks: number
}

interface Props {
  items: RailItem[]
  active: number
  onPick: (i: number) => void
  onRemove: (i: number) => void
  onAdd: () => void
}

export function BatchRail({ items, active, onPick, onRemove, onAdd }: Props) {
  const t = useT()
  return (
    <div className="absolute top-16 bottom-24 left-3 z-20 flex w-[76px] flex-col items-center">
      <div className="floating scroll-quiet flex max-h-full flex-col items-center gap-1.5 overflow-y-auto rounded-lg p-1.5">
        <AnimatePresence initial={false}>
          {items.map((it, i) => {
            const sel = i === active
            return (
              <motion.div
                key={it.id}
                className="group relative shrink-0"
                initial={{ opacity: 0, transform: 'scale(0.9)' }}
                animate={{ opacity: 1, transform: 'scale(1)' }}
                exit={{ opacity: 0, transform: 'scale(0.9)', transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              >
                <button
                  type="button"
                  aria-label={t('batch.item', { n: i + 1 })}
                  aria-pressed={sel}
                  onClick={() => onPick(i)}
                  className={`press relative block h-[46px] w-[62px] overflow-hidden rounded-[5px] ${
                    sel ? 'shadow-[0_0_0_2px_var(--ink)]' : 'opacity-60 shadow-[0_0_0_1px_var(--line-strong)] hover:opacity-90'
                  }`}
                >
                  <img src={it.src} alt="" className="h-full w-full object-cover" draggable={false} />
                  <span className="tabular absolute bottom-0.5 left-0.5 rounded-[3px] bg-black/65 px-1 text-[10.5px] leading-[15px] font-semibold text-white">{i + 1}</span>
                  {it.marks > 0 && (
                    <span className="tabular absolute right-0.5 bottom-0.5 rounded-[3px] bg-[#FF5A36] px-1 text-[10.5px] leading-[15px] font-semibold text-white">{it.marks}</span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={t('batch.remove')}
                  title={t('batch.remove')}
                  onClick={() => onRemove(i)}
                  className="press absolute -top-1.5 -right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-surface text-ink-2 opacity-0 shadow-[0_0_0_1px_var(--line-strong),0_1px_3px_rgb(0_0_0/0.2)] group-hover:opacity-100 hover:text-bad focus-visible:opacity-100"
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <path d="M1 1l8 8M9 1L1 9" />
                  </svg>
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
        <button
          type="button"
          aria-label={t('batch.add')}
          title={t('batch.add')}
          onClick={onAdd}
          className="press flex h-[46px] w-[62px] shrink-0 items-center justify-center rounded-[5px] text-ink-3 shadow-[inset_0_0_0_1.5px_var(--line-strong)] hover:bg-hover hover:text-ink"
          style={{ borderStyle: 'dashed' }}
        >
          <Add size={20} variant="Linear" color="currentColor" />
        </button>
      </div>
    </div>
  )
}
