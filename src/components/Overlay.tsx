import { useEffect, useRef, useState } from 'react'
import { translate, type Key, type Lang } from '../lib/i18n'

interface WinInfo {
  hwnd: string
  title: string
  app: string
  x: number
  y: number
  w: number
  h: number
  minimized: boolean
}

interface Payload {
  path: string
  width: number
  height: number
  stamp: number
  windows: WinInfo[]
}

interface Sel {
  x0: number
  y0: number
  x1: number
  y1: number
}

type Mode = 'area' | 'window'

const MIN = 6
const MODE_KEY = 'aisight:capture-mode'

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'window' ? 'window' : 'area'
  } catch {
    return 'area'
  }
}

export function Overlay() {
  const [shot, setShot] = useState<{ src: string; width: number; height: number; windows: WinInfo[] } | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [mode, setModeState] = useState<Mode>(readMode)
  const [lang, setLang] = useState<Lang>('en')
  const [query, setQuery] = useState('')
  const [listHover, setListHover] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const searchRef = useRef<HTMLInputElement>(null)
  const stampRef = useRef(0)
  const dragging = useRef(false)
  const api = useRef<{ invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } | null>(null)
  const t = (k: Key) => translate(lang, k)

  const setMode = (m: Mode) => {
    setModeState(m)
    setSel(null)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {}
  }

  useEffect(() => {
    if (!new URLSearchParams(location.search).has('demo')) return
    setShot({
      src: '/demo-desktop.png',
      width: 1920,
      height: 1080,
      windows: [
        { hwnd: 'd1', title: 'claude · northwind', app: 'Terminal', x: 960, y: 330, w: 860, h: 560, minimized: false },
        { hwnd: 'd2', title: 'Northwind · Overview', app: 'Chrome', x: 110, y: 70, w: 1120, h: 730, minimized: false },
        { hwnd: 'd3', title: 'storefront', app: 'Cursor', x: 0, y: 0, w: 0, h: 0, minimized: true },
        { hwnd: 'd4', title: '#product-team', app: 'Slack', x: 0, y: 0, w: 0, h: 0, minimized: true },
      ],
    })
  }, [])

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let off: (() => void) | undefined
    let offThumb: (() => void) | undefined
    ;(async () => {
      const core = await import('@tauri-apps/api/core')
      const { listen } = await import('@tauri-apps/api/event')
      api.current = core
      off = await listen<Payload>('overlay', (e) => {
        setSel(null)
        setCursor(null)
        setQuery('')
        setListHover(null)
        setThumbs({})
        stampRef.current = e.payload.stamp
        dragging.current = false
        core.invoke<{ language?: Lang }>('get_settings').then((s) => setLang(s.language ?? 'en')).catch(() => {})
        setShot({
          src: `${core.convertFileSrc(e.payload.path)}?t=${e.payload.stamp}`,
          width: e.payload.width,
          height: e.payload.height,
          windows: e.payload.windows,
        })
      })
      offThumb = await listen<{ hwnd: string; path: string; stamp: number }>('overlay-thumb', (e) => {
        if (e.payload.stamp !== stampRef.current) return
        setThumbs((cur) => ({ ...cur, [e.payload.hwnd]: `${core.convertFileSrc(e.payload.path)}?t=${e.payload.stamp}` }))
      })
    })()
    return () => {
      off?.()
      offThumb?.()
    }
  }, [])

  const ratio = shot ? shot.width / window.innerWidth : 1

  const cancel = () => {
    setShot(null)
    setSel(null)
    api.current?.invoke('cancel_overlay')
  }

  const finishArea = (s: Sel | 'full') => {
    if (!shot) return
    const rect =
      s === 'full'
        ? { x: 0, y: 0, w: shot.width, h: shot.height }
        : {
            x: Math.round(Math.min(s.x0, s.x1) * ratio),
            y: Math.round(Math.min(s.y0, s.y1) * ratio),
            w: Math.round(Math.abs(s.x1 - s.x0) * ratio),
            h: Math.round(Math.abs(s.y1 - s.y0) * ratio),
          }
    setShot(null)
    setSel(null)
    api.current?.invoke('finish_overlay', rect)
  }

  const listed = shot && listHover ? shot.windows.find((w) => w.hwnd === listHover && !w.minimized) : undefined
  const hovered =
    listed ??
    (shot && mode === 'window' && cursor && !listHover
      ? shot.windows.find((w) => {
          if (w.minimized) return false
          const px = cursor.x * ratio
          const py = cursor.y * ratio
          return px >= w.x && px < w.x + w.w && py >= w.y && py < w.y + w.h
        })
      : undefined)

  const finishWindow = (w: WinInfo) => {
    setShot(null)
    api.current?.invoke('finish_window', { hwnd: w.hwnd })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shot) return
      const inSearch = e.target instanceof HTMLInputElement
      if (e.key === 'Escape') {
        if (inSearch) {
          ;(e.target as HTMLInputElement).blur()
          setQuery('')
        } else cancel()
        return
      }
      if (inSearch) return
      if (e.key === '/' && mode === 'window') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        finishArea('full')
      } else if (e.key.toLowerCase() === 'w') setMode('window')
      else if (e.key.toLowerCase() === 'a') setMode('area')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!shot) return <div className="h-full w-full bg-black" />

  const box = sel && {
    left: Math.min(sel.x0, sel.x1),
    top: Math.min(sel.y0, sel.y1),
    width: Math.abs(sel.x1 - sel.x0),
    height: Math.abs(sel.y1 - sel.y0),
  }
  const hoverBox = hovered && { left: hovered.x / ratio, top: hovered.y / ratio, width: hovered.w / ratio, height: hovered.h / ratio }
  const highlight = box ?? hoverBox

  return (
    <div
      className="relative h-full w-full cursor-crosshair overflow-hidden select-none"
      onPointerDown={(e) => {
        if (e.button === 2) return cancel()
        if (e.button !== 0) return
        if ((e.target as HTMLElement).closest('[data-toolbar], [data-winlist]')) return
        if (mode === 'window') {
          if (hovered) finishWindow(hovered)
          return
        }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        dragging.current = true
        setSel({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY })
      }}
      onPointerMove={(e) => {
        setCursor({ x: e.clientX, y: e.clientY })
        if (dragging.current) setSel((s) => (s ? { ...s, x1: e.clientX, y1: e.clientY } : s))
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return
        dragging.current = false
        const s = sel ? { ...sel, x1: e.clientX, y1: e.clientY } : null
        if (s && Math.abs(s.x1 - s.x0) > MIN && Math.abs(s.y1 - s.y0) > MIN) finishArea(s)
        else setSel(null)
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img src={shot.src} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />

      {highlight ? (
        <div
          className="pointer-events-none absolute"
          style={{
            ...highlight,
            boxShadow: '0 0 0 100vmax rgb(0 0 0 / 0.42)',
            outline: mode === 'window' ? '2px solid #FF5A36' : '1.5px solid #ffffff',
            outlineOffset: mode === 'window' ? -2 : 0,
          }}
        >
          <span className="tabular absolute -top-7 left-0 max-w-[480px] truncate rounded-[4px] bg-black/80 px-1.5 py-0.5 font-mono text-[12px] text-white">
            {mode === 'window' && hovered
              ? `${hovered.app}${hovered.title && hovered.title !== hovered.app ? ` · ${hovered.title}` : ''}`
              : `${Math.round(highlight.width * ratio)} × ${Math.round(highlight.height * ratio)}`}
          </span>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/25" />
      )}

      {mode === 'area' && !box && cursor && (
        <>
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/50" style={{ left: cursor.x }} />
          <div className="pointer-events-none absolute right-0 left-0 h-px bg-white/50" style={{ top: cursor.y }} />
        </>
      )}

      {!box && (
        <div
          data-toolbar
          className="absolute top-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-black/80 p-1 text-[13.5px] text-white shadow-lg"
        >
          <ModeButton active={mode === 'area'} onClick={() => setMode('area')} label={t('ov.modeArea')} k="A" />
          <ModeButton active={mode === 'window'} onClick={() => setMode('window')} label={t('ov.modeWindow')} k="W" />
          <ModeButton active={false} onClick={() => finishArea('full')} label={t('ov.modeFull')} k="Enter" />
          <span className="mx-1 h-5 w-px bg-white/20" />
          <button type="button" onClick={cancel} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">
            <span className="rounded-[4px] bg-white/15 px-1.5 py-px text-[12px] font-medium">Esc</span>
            {t('ov.cancel')}
          </button>
        </div>
      )}
      {mode === 'window' && (
        <WindowList
          windows={shot.windows}
          shot={shot}
          thumbs={thumbs}
          searchRef={searchRef}
          query={query}
          onQuery={setQuery}
          placeholder={t('ov.search')}
          minimizedLabel={t('ov.minimized')}
          onHover={setListHover}
          onPick={finishWindow}
        />
      )}
    </div>
  )
}

function WindowList({
  windows,
  shot,
  thumbs,
  searchRef,
  query,
  onQuery,
  placeholder,
  minimizedLabel,
  onHover,
  onPick,
}: {
  windows: WinInfo[]
  shot: { src: string; width: number; height: number }
  thumbs: Record<string, string>
  searchRef: React.RefObject<HTMLInputElement | null>
  query: string
  onQuery: (q: string) => void
  placeholder: string
  minimizedLabel: string
  onHover: (hwnd: string | null) => void
  onPick: (w: WinInfo) => void
}) {
  const q = query.trim().toLowerCase()
  const items = windows.filter((w) => !q || `${w.app} ${w.title}`.toLowerCase().includes(q))
  return (
    <div
      data-winlist
      className="absolute top-20 right-5 flex max-h-[calc(100%-110px)] w-[460px] cursor-default flex-col overflow-hidden rounded-lg bg-black/85 text-white shadow-2xl"
      onPointerLeave={() => onHover(null)}
    >
      <div className="flex items-center gap-2 border-b border-white/10 p-2">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-md bg-white/10 px-2.5 py-1.5 text-[13.5px] text-white outline-none placeholder:text-white/45"
        />
        <span className="rounded-[4px] bg-white/15 px-1.5 py-px text-[11.5px] font-medium text-white/70">/</span>
      </div>
      <div
        className="grid min-h-0 grid-cols-2 gap-1.5 overflow-y-auto p-2"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgb(255 255 255 / 0.2) transparent' }}
      >
        {items.map((w) => (
          <button
            key={w.hwnd}
            type="button"
            onPointerEnter={() => onHover(w.hwnd)}
            onClick={() => onPick(w)}
            className="group flex min-w-0 flex-col gap-1.5 rounded-md p-1.5 text-left hover:bg-white/12"
          >
            <Thumb w={w} shot={shot} src={thumbs[w.hwnd]} />
            <span className="flex w-full min-w-0 items-center gap-1.5 px-0.5">
              <span className="truncate text-[13px] font-medium">{w.app}</span>
              {w.minimized && <span className="shrink-0 rounded-[4px] bg-white/15 px-1 text-[10.5px] text-white/70">{minimizedLabel}</span>}
            </span>
            {w.title && w.title !== w.app && <span className="-mt-1 w-full truncate px-0.5 text-[12px] text-white/55">{w.title}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function Thumb({ w, shot, src }: { w: WinInfo; shot: { src: string; width: number; height: number }; src?: string }) {
  const frame = 'relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-[5px] bg-white/[0.06] ring-1 ring-white/10 group-hover:ring-white/30'
  if (src) {
    return (
      <span className={frame}>
        <img src={src} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
      </span>
    )
  }
  if (w.minimized) {
    return (
      <span className={frame}>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/12 text-[18px] font-semibold text-white/80">
          {w.app.charAt(0).toUpperCase()}
        </span>
      </span>
    )
  }
  const scale = Math.min(212 / w.w, 132 / w.h)
  return (
    <span className={frame}>
      <span
        className="block"
        style={{
          width: w.w * scale,
          height: w.h * scale,
          backgroundImage: `url("${shot.src}")`,
          backgroundSize: `${shot.width * scale}px ${shot.height * scale}px`,
          backgroundPosition: `${-w.x * scale}px ${-w.y * scale}px`,
        }}
      />
    </span>
  )
}

function ModeButton({ active, onClick, label, k }: { active: boolean; onClick: () => void; label: string; k: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 ${active ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
    >
      {label}
      <span className={`rounded-[4px] px-1.5 py-px text-[11.5px] font-medium ${active ? 'bg-black/10' : 'bg-white/15'}`}>{k}</span>
    </button>
  )
}
