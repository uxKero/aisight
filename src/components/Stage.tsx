import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Brush2, Global, InfoCircle, Monitor, Text as TextIcon, Trash } from 'iconsax-reactjs'
import type { ContextToggles, Mark, SourceContext } from '../lib/types'
import { MARK_COLORS, inkOn, markBounds } from '../lib/compose'
import { useT } from '../lib/i18n'

interface Props {
  src: string
  width: number
  height: number
  marks: Mark[]
  activeId: string | null
  color: string
  source: SourceContext
  ctx: ContextToggles
  onAdd: (m: Pick<Mark, 'x' | 'y' | 'w' | 'h'>) => void
  onUpdate: (id: string, patch: Partial<Mark>) => void
  onRemove: (id: string) => void
  onActivate: (id: string | null) => void
  onColor: (c: string) => void
  onClear: () => void
  onToggleCtx: (key: keyof ContextToggles) => void
  onSubmitKey: (alt: boolean) => void
  footer: React.ReactNode
  rail?: React.ReactNode
  insetLeft?: number
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const PAD = { top: 64, bottom: 92, x: 28 }
const DRAG_THRESHOLD = 5
const ZOOM_MIN = 0.25
const ZOOM_MAX = 6
const EASE = [0.23, 1, 0.32, 1] as const

export function Stage(p: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const start = useRef<{ x: number; y: number; id: number } | null>(null)

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [p.src])

  const inset = p.insetLeft ?? 0
  const availW = Math.max(size.w - inset - PAD.x * 2, 1)
  const availH = Math.max(size.h - PAD.top - PAD.bottom, 1)
  const fit = Math.min(availW / p.width, availH / p.height, 2)
  const scale = fit * zoom
  const cx0 = inset + (size.w - inset) / 2
  const cy0 = PAD.top + availH / 2
  const rect: Rect = {
    width: p.width * scale,
    height: p.height * scale,
    left: cx0 - (p.width * scale) / 2 + pan.x,
    top: cy0 - (p.height * scale) / 2 + pan.y,
  }

  const view = useRef({ zoom, pan, fit, cx0, cy0 })
  view.current = { zoom, pan, fit, cx0, cy0 }

  const zoomTo = (next: number, at?: { x: number; y: number }) => {
    const v = view.current
    const z = Math.min(Math.max(next, ZOOM_MIN), ZOOM_MAX)
    const W = p.width * v.fit * v.zoom
    const H = p.height * v.fit * v.zoom
    const left = v.cx0 - W / 2 + v.pan.x
    const top = v.cy0 - H / 2 + v.pan.y
    const ax = at?.x ?? v.cx0
    const ay = at?.y ?? v.cy0
    const u = (ax - left) / W
    const w = (ay - top) / H
    const W2 = p.width * v.fit * z
    const H2 = p.height * v.fit * z
    setZoom(z)
    setPan({ x: ax - u * W2 - v.cx0 + W2 / 2, y: ay - w * H2 - v.cy0 + H2 / 2 })
  }

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const box = el.getBoundingClientRect()
        const factor = Math.exp(-e.deltaY * 0.0015)
        zoomTo(view.current.zoom * factor, { x: e.clientX - box.left, y: e.clientY - box.top })
        return
      }
      if ((e.target as HTMLElement).closest('textarea, .scroll-quiet')) return
      e.preventDefault()
      setPan((cur) => ({ x: cur.x - (e.shiftKey ? e.deltaY : e.deltaX), y: cur.y - (e.shiftKey ? 0 : e.deltaY) }))
    }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '0') {
        e.preventDefault()
        setZoom(1)
        setPan({ x: 0, y: 0 })
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        zoomTo(view.current.zoom * 1.25)
      } else if (e.key === '-') {
        e.preventDefault()
        zoomTo(view.current.zoom / 1.25)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (!typing && p.activeId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        p.onRemove(p.activeId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const draftRef = useRef(draft)
  draftRef.current = draft
  const rectRef = useRef(rect)
  rectRef.current = rect

  const local = (clientX: number, clientY: number) => {
    const stageBox = stageRef.current!.getBoundingClientRect()
    const r = rectRef.current
    const sx = Math.min(Math.max(clientX - stageBox.left, 0), stageBox.width)
    const sy = Math.min(Math.max(clientY - stageBox.top, 0), stageBox.height)
    return { x: sx - r.left, y: sy - r.top }
  }

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || start.current) return
    const pt = local(e.clientX, e.clientY)
    start.current = { ...pt, id: e.pointerId }

    const move = (ev: PointerEvent) => {
      const s = start.current
      if (!s || s.id !== ev.pointerId) return
      const q = local(ev.clientX, ev.clientY)
      if (draftRef.current || Math.hypot(q.x - s.x, q.y - s.y) > DRAG_THRESHOLD) setDraft({ x0: s.x, y0: s.y, x1: q.x, y1: q.y })
    }
    const finish = (ev: PointerEvent) => {
      const s = start.current
      if (!s || s.id !== ev.pointerId) return
      detach()
      start.current = null
      const q = local(ev.clientX, ev.clientY)
      const d = draftRef.current
      setDraft(null)
      const r = rectRef.current
      if (d) {
        const x = Math.min(d.x0, q.x) / r.width
        const y = Math.min(d.y0, q.y) / r.height
        const w = Math.abs(q.x - d.x0) / r.width
        const h = Math.abs(q.y - d.y0) / r.height
        if (w > 0.006 && h > 0.006) p.onAdd({ x, y, w, h })
        return
      }
      if (p.activeId) {
        p.onActivate(null)
        return
      }
      p.onAdd({ x: q.x / r.width, y: q.y / r.height, w: 0, h: 0 })
    }
    const cancel = () => {
      start.current = null
      setDraft(null)
      detach()
    }
    const detach = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
  }

  const bounds = markBounds(p.marks, p.width / p.height)
  const EXT = 10

  return (
    <div ref={stageRef} className="stage relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 cursor-crosshair touch-none select-none" onPointerDown={down} />

      <AnimatePresence>
        {bounds.expanded && size.w > 0 && (
          <motion.div
            className="pointer-events-none absolute rounded-[4px] border border-dashed border-ink-3/60 bg-surface/50"
            style={{
              left: rect.left + bounds.minX * rect.width - EXT,
              top: rect.top + bounds.minY * rect.height - EXT,
              width: (bounds.maxX - bounds.minX) * rect.width + EXT * 2,
              height: (bounds.maxY - bounds.minY) * rect.height + EXT * 2,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
        )}
      </AnimatePresence>

      <ContextBar
        source={p.source}
        ctx={p.ctx}
        onToggle={p.onToggleCtx}
        color={p.color}
        onColor={p.onColor}
        canClear={p.marks.length > 0}
        onClear={p.onClear}
      />

      {size.w > 0 && (
        <div className="image-frame pointer-events-none absolute overflow-hidden rounded-[3px]" style={rect}>
          <img src={p.src} alt="" draggable={false} className="block h-full w-full" />
        </div>
      )}

      {draft && (
        <div
          className="pointer-events-none absolute z-10 rounded-[3px] border-2"
          style={{
            left: rect.left + Math.min(draft.x0, draft.x1),
            top: rect.top + Math.min(draft.y0, draft.y1),
            width: Math.abs(draft.x1 - draft.x0),
            height: Math.abs(draft.y1 - draft.y0),
            borderColor: p.color,
            background: `${p.color}14`,
          }}
        />
      )}

      <AnimatePresence>
        {p.marks.map((m) => (
          <MarkLayer
            key={m.id}
            mark={m}
            rect={rect}
            stage={size}
            active={m.id === p.activeId}
            onActivate={() => p.onActivate(m.id)}
            onDeactivate={() => p.onActivate(null)}
            onUpdate={(patch) => p.onUpdate(m.id, patch)}
            onRemove={() => p.onRemove(m.id)}
            onSubmitKey={p.onSubmitKey}
          />
        ))}
      </AnimatePresence>

      <ZoomControl
        percent={Math.round(scale * 100)}
        onIn={() => zoomTo(zoom * 1.25)}
        onOut={() => zoomTo(zoom / 1.25)}
        onReset={() => {
          setZoom(1)
          setPan({ x: 0, y: 0 })
        }}
      />
      {p.rail}
      {p.footer}
    </div>
  )
}

function ZoomControl({ percent, onIn, onOut, onReset }: { percent: number; onIn: () => void; onOut: () => void; onReset: () => void }) {
  const t = useT()
  const btn = 'press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink'
  return (
    <div className="floating absolute right-3 bottom-[84px] z-20 flex items-center gap-0.5 rounded-lg p-1">
      <button type="button" aria-label={t('zoom.out')} title={`${t('zoom.out')}  ·  Ctrl + −`} onClick={onOut} className={btn}>
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M2 6h8" />
        </svg>
      </button>
      <button
        type="button"
        title={`${t('zoom.fit')}  ·  Ctrl + 0`}
        onClick={onReset}
        className="press tabular min-w-[52px] rounded-md px-1.5 py-1 text-[12.5px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
      >
        {percent}%
      </button>
      <button type="button" aria-label={t('zoom.in')} title={`${t('zoom.in')}  ·  Ctrl + wheel`} onClick={onIn} className={btn}>
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M2 6h8M6 2v8" />
        </svg>
      </button>
    </div>
  )
}

function ContextBar({
  source,
  ctx,
  onToggle,
  color,
  onColor,
  canClear,
  onClear,
}: {
  source: SourceContext
  ctx: ContextToggles
  onToggle: (k: keyof ContextToggles) => void
  color: string
  onColor: (c: string) => void
  canClear: boolean
  onClear: () => void
}) {
  const t = useT()
  const chips: { key: keyof ContextToggles; label: string; icon: React.ReactNode; mono?: boolean }[] = []
  if (source.app) chips.push({ key: 'app', label: source.app, icon: <Monitor size={15} variant="Linear" color="currentColor" /> })
  if (source.title) chips.push({ key: 'title', label: source.title, icon: <TextIcon size={15} variant="Linear" color="currentColor" /> })
  if (source.url) chips.push({ key: 'url', label: source.url, icon: <Global size={15} variant="Linear" color="currentColor" />, mono: true })

  return (
    <div className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3">
      <div className="floating flex min-w-0 items-center gap-0.5 rounded-lg p-1">
        <span
          className="flex h-7 w-7 shrink-0 cursor-help items-center justify-center text-ink-3"
          title={t('ctx.info')}
        >
          <InfoCircle size={16} variant="Linear" color="currentColor" />
        </span>
        {chips.length === 0 ? (
          <span className="px-2 py-1 text-[13px] text-ink-3">{t('ctx.none')}</span>
        ) : (
          chips.map((c) => {
            const on = ctx[c.key]
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                title={on ? t('ctx.on') : t('ctx.off')}
                onClick={() => onToggle(c.key)}
                className={`press flex min-w-0 max-w-[260px] items-center gap-1.5 rounded-md px-2 py-1 text-[13px] ${
                  on ? 'bg-selected text-ink' : 'text-ink-3 hover:bg-hover'
                }`}
              >
                <span className="shrink-0 opacity-70">{c.icon}</span>
                <span className={`truncate ${c.mono ? 'font-mono text-[12.5px]' : ''} ${on ? '' : 'line-through decoration-1'}`}>
                  {c.label}
                </span>
              </button>
            )
          })
        )}
      </div>

      <div className="floating flex shrink-0 items-center gap-1 rounded-lg p-1">
        <span className="px-1.5 text-ink-3">
          <Brush2 size={16} variant="Linear" color="currentColor" />
        </span>
        {MARK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={t('marks.color')}
            aria-pressed={c === color}
            onClick={() => onColor(c)}
            className="press flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover"
          >
            <span
              className="h-[14px] w-[14px] rounded-full transition-[box-shadow] duration-150"
              style={{ background: c, boxShadow: c === color ? `0 0 0 2px var(--surface), 0 0 0 3.5px ${c}` : 'none' }}
            />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          aria-label={t('marks.clear')}
          title={t('marks.clear')}
          disabled={!canClear}
          onClick={onClear}
          className="press flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover disabled:opacity-35"
        >
          <Trash size={16} variant="Linear" color="currentColor" />
        </button>
      </div>
    </div>
  )
}

function MarkLayer({
  mark,
  rect,
  stage,
  active,
  onActivate,
  onDeactivate,
  onUpdate,
  onRemove,
  onSubmitKey,
}: {
  mark: Mark
  rect: Rect
  stage: { w: number; h: number }
  active: boolean
  onActivate: () => void
  onDeactivate: () => void
  onUpdate: (patch: Partial<Mark>) => void
  onRemove: () => void
  onSubmitKey: (alt: boolean) => void
}) {
  const t = useT()
  const isBox = mark.w > 0 && mark.h > 0
  const px = rect.left + mark.x * rect.width
  const py = rect.top + mark.y * rect.height
  const pw = mark.w * rect.width
  const ph = mark.h * rect.height
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardW, setCardW] = useState(220)
  const [palette, setPalette] = useState(false)

  useEffect(() => {
    if (active) inputRef.current?.focus()
    else setPalette(false)
  }, [active])

  useLayoutEffect(() => {
    if (cardRef.current) setCardW(cardRef.current.offsetWidth)
  })

  const showCard = active || mark.note.trim() !== ''
  const cardH = 34
  let cx = isBox ? px : px + 14
  let cy = isBox ? py + ph + 5 : py - cardH / 2
  if (isBox && cy + cardH > stage.h - PAD.bottom + 20) cy = py - cardH - 5
  if (!isBox && cx + cardW > stage.w - 8) cx = px - 14 - cardW
  cx = Math.min(Math.max(cx, 8), stage.w - cardW - 8)
  cy = Math.min(Math.max(cy, PAD.top - 8), stage.h - cardH - 8)

  const stop = (e: React.PointerEvent) => e.stopPropagation()

  return (
    <>
      {isBox && (
        <motion.div
          className="absolute z-10 cursor-pointer rounded-[3px]"
          style={{
            left: px,
            top: py,
            width: pw,
            height: ph,
            border: `2px solid ${mark.color}`,
            boxShadow: `0 0 0 1px rgb(0 0 0 / 0.18)${active ? `, 0 0 0 4px ${mark.color}33` : ''}`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.15 }}
          onPointerDown={stop}
          onClick={onActivate}
          onContextMenu={(e) => {
            e.preventDefault()
            onRemove()
          }}
        />
      )}

      <motion.button
        type="button"
        aria-label={t('mark.label', { n: mark.n })}
        className="tabular absolute z-20 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[4px] text-[11px] leading-none font-bold"
        style={{
          left: px - 9,
          top: py - 9,
          background: mark.color,
          color: inkOn(mark.color),
          boxShadow: '0 0 0 1.5px rgb(255 255 255 / 0.95), 0 1px 3px rgb(0 0 0 / 0.3)',
        }}
        initial={{ opacity: 0, transform: 'scale(0.6)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        exit={{ opacity: 0, transform: 'scale(0.8)', transition: { duration: 0.1 } }}
        transition={{ type: 'spring', duration: 0.26, bounce: 0.2 }}
        onPointerDown={stop}
        onClick={onActivate}
        onContextMenu={(e) => {
          e.preventDefault()
          onRemove()
        }}
      >
        {mark.n}
      </motion.button>

      <AnimatePresence>
        {showCard && (
          <motion.div
            ref={cardRef}
            className="floating absolute z-30 flex items-center gap-1 rounded-md py-1 pr-1 pl-1.5"
            style={{ left: cx, top: cy, height: cardH, minWidth: isBox ? Math.max(pw, 150) : undefined, borderColor: `${mark.color}66`, transformOrigin: isBox ? 'top left' : 'left center' }}
            initial={{ opacity: 0, transform: 'translateY(-3px) scale(0.98)' }}
            animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
            exit={{ opacity: 0, transform: 'translateY(-3px) scale(0.98)', transition: { duration: 0.1 } }}
            transition={{ duration: 0.16, ease: EASE }}
            onPointerDown={stop}
          >
            <button
              type="button"
              aria-label={t('mark.changeColor')}
              onClick={() => setPalette((v) => !v)}
              className="press flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] hover:bg-hover"
            >
              <span className="h-3 w-3 rounded-full" style={{ background: mark.color, boxShadow: '0 0 0 1px rgb(0 0 0 / 0.12)' }} />
            </button>

            <AnimatePresence initial={false} mode="popLayout">
              {palette ? (
                <motion.div
                  key="palette"
                  className="flex items-center gap-0.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  {MARK_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      onClick={() => {
                        onUpdate({ color: c })
                        setPalette(false)
                        inputRef.current?.focus()
                      }}
                      className="press flex h-6 w-6 items-center justify-center rounded-[4px] hover:bg-hover"
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: c, boxShadow: c === mark.color ? `0 0 0 2px var(--surface), 0 0 0 3px ${c}` : 'none' }}
                      />
                    </button>
                  ))}
                </motion.div>
              ) : (
                <motion.input
                  key="input"
                  ref={inputRef}
                  value={mark.note}
                  size={Math.max(mark.note.length, 6)}
                  onChange={(e) => onUpdate({ note: e.target.value })}
                  onFocus={onActivate}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      onSubmitKey(true)
                    } else if (e.key === 'Enter' || e.key === 'Escape') {
                      e.preventDefault()
                      inputRef.current?.blur()
                      onDeactivate()
                    } else if (e.key === 'Backspace' && mark.note === '') {
                      e.preventDefault()
                      onRemove()
                    }
                  }}
                  placeholder={t('mark.note')}
                  spellCheck={false}
                  className="max-w-[300px] min-w-[60px] flex-1 px-1 text-[13.5px] text-ink placeholder:text-ink-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                />
              )}
            </AnimatePresence>
            <button
              type="button"
              aria-label={t('mark.remove')}
              title={t('mark.remove')}
              onClick={onRemove}
              className="press ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-ink-3 hover:bg-hover hover:text-bad"
            >
              <Trash size={14} variant="Linear" color="currentColor" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
