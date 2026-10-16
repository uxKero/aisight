import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Backend } from './lib/backend'
import { DEFAULT_SETTINGS, backendPromise } from './lib/backend'
import type { Capture, ContextToggles, Mark, Settings, Target } from './lib/types'
import { MARK_COLORS, composeMany, renderAnnotated } from './lib/compose'
import { BatchRail } from './components/BatchRail'
import { applyTheme, watchSystemTheme } from './lib/theme'
import { DEFAULT_TEMPLATES, LangContext, translate, translateError, type Lang } from './lib/i18n'
import { Stage } from './components/Stage'
import { SendPanel, type ShareKind } from './components/SendPanel'
import { MessageBar, type Status } from './components/MessageBar'
import { History } from './components/History'
import { SettingsModal } from './components/SettingsView'
import { TitleBar, type View } from './components/TitleBar'
import { Logo } from './components/Logo'

const LAST_TARGETS_KEY = 'aisight:last-targets'

function readLastTargets(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LAST_TARGETS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function ctxFrom(s: Settings): ContextToggles {
  return { app: s.contextApp, title: s.contextTitle, url: s.contextUrl }
}

interface Draft {
  capture: Capture
  marks: Mark[]
  ctx: ContextToggles
  color: string
}

type Updater<T> = T | ((cur: T) => T)

function apply<T>(u: Updater<T>, cur: T): T {
  return typeof u === 'function' ? (u as (c: T) => T)(cur) : u
}

export default function App() {
  const [backend, setBackend] = useState<Backend | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [view, setView] = useState<View>('capture')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [active, setActive] = useState(0)
  const [activeMark, setActiveMark] = useState<string | null>(null)
  const batchDone = useRef(false)
  const [message, setMessage] = useState('')
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [history, setHistory] = useState<Capture[] | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lastMessage, setLastMessage] = useState<string | undefined>()
  const [maximized, setMaximized] = useState(false)
  const lang: Lang = settings.language ?? 'en'

  const draft = drafts[active] ?? drafts[drafts.length - 1]
  const capture = draft?.capture ?? null
  const marks = draft?.marks ?? []
  const ctx = draft?.ctx ?? ctxFrom(settings)
  const color = draft?.color ?? MARK_COLORS[0]
  const patchDraft = (fn: (d: Draft) => Draft) => setDrafts((ds) => ds.map((d, i) => (i === active ? fn(d) : d)))
  const setMarks = (u: Updater<Mark[]>) => patchDraft((d) => ({ ...d, marks: apply(u, d.marks) }))
  const setCtx = (u: Updater<ContextToggles>) => patchDraft((d) => ({ ...d, ctx: apply(u, d.ctx) }))
  const setColor = (u: Updater<string>) => patchDraft((d) => ({ ...d, color: apply(u, d.color) }))

  useEffect(() => {
    backendPromise.then(async (b) => {
      setBackend(b)
      const s = await b.getSettings()
      setSettings(s)
      const h = await b.history()
      setLastMessage(h.find((c) => c.message.trim())?.message)
    })
  }, [])

  useEffect(() => backend?.onResized(setMaximized), [backend])

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang
  }, [lang])

  useEffect(() => {
    if (!backend) return
    applyTheme(settings.theme, backend)
    if (settings.theme !== 'system') return
    return watchSystemTheme(() => applyTheme('system', backend))
  }, [settings.theme, backend])

  const refreshTargets = useCallback(async (b: Backend) => {
    setTargets(null)
    try {
      const list = await b.listTargets()
      setTargets(list)
      setSelected((cur) => {
        const alive = cur.filter((id) => list.some((t) => t.id === id))
        if (alive.length) return alive
        const last = readLastTargets().filter((id) => list.some((t) => t.id === id))
        if (last.length) return last
        return list[0] ? [list[0].id] : []
      })
    } catch (e) {
      setTargets([])
      setStatus({ kind: 'error', message: String(e) })
    }
  }, [])

  const load = useCallback(
    (c: Capture, b: Backend, s: Settings) => {
      const next: Draft = {
        capture: c,
        marks: c.marks.map((m, i) => ({ ...m, color: m.color || MARK_COLORS[i % MARK_COLORS.length] })),
        ctx: ctxFrom(s),
        color: MARK_COLORS[c.marks.length % MARK_COLORS.length],
      }
      const fresh = batchDone.current
      batchDone.current = false
      setDrafts((ds) => {
        const base = fresh ? [] : ds.filter((d) => d.capture.id !== c.id)
        setActive(base.length)
        return [...base, next]
      })
      if (fresh || c.message) setMessage(c.message)
      setActiveMark(null)
      setStatus({ kind: 'idle' })
      setView('capture')
      refreshTargets(b)
    },
    [refreshTargets],
  )

  useEffect(() => {
    if (!backend) return
    return backend.onCapture((c) => load({ ...c, marks: [], message: '' }, backend, settings))
  }, [backend, load, settings])

  useEffect(() => {
    if (view === 'history' && backend) backend.history().then(setHistory)
  }, [view, backend])

  useEffect(() => {
    if (status.kind !== 'error' && status.kind !== 'info') return
    const id = setTimeout(() => setStatus({ kind: 'idle' }), 7000)
    return () => clearTimeout(id)
  }, [status])

  const chosen = useMemo(() => (targets ?? []).filter((t) => selected.includes(t.id)), [targets, selected])

  const addMark = (m: Pick<Mark, 'x' | 'y' | 'w' | 'h'>) => {
    const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    setMarks((cur) => [...cur, { ...m, id, n: cur.length + 1, note: '', color }])
    setActiveMark(id)
    setColor((c) => MARK_COLORS[(MARK_COLORS.indexOf(c as (typeof MARK_COLORS)[number]) + 1) % MARK_COLORS.length])
  }

  const removeMark = (id: string) => {
    setMarks((cur) => cur.filter((m) => m.id !== id).map((m, i) => ({ ...m, n: i + 1 })))
    setActiveMark(null)
  }

  const renderFor = async (kind: 'agent' | 'share'): Promise<string[]> => {
    if (!backend || !drafts.length) throw new Error('no capture')
    return Promise.all(
      drafts.map(async (d) => {
        if (!d.marks.length) return d.capture.path
        const withNotes = kind === 'share' && d.marks.some((m) => m.note.trim())
        const png = await renderAnnotated(backend.imageUrl(d.capture.path), d.marks, { notes: withNotes })
        return backend.saveRender(d.capture.id, png, kind)
      }),
    )
  }

  const saveAll = async (extra?: (d: Draft) => Partial<Capture>) => {
    if (!backend) return
    const next = drafts.map((d) => ({ ...d, capture: { ...d.capture, marks: d.marks, message, ...(extra?.(d) ?? {}) } }))
    setDrafts(next)
    await Promise.all(next.map((d) => backend.saveRecord(d.capture).catch(() => {})))
  }

  const composed = composeMany(
    message,
    drafts.map((d) => ({ marks: d.marks, source: d.capture.source, ctx: d.ctx })),
    lang,
  )

  const deliver = async (submit: boolean) => {
    if (!backend || !capture || !chosen.length || status.kind === 'sending') return
    setStatus({ kind: 'sending', submit })
    try {
      const imagePaths = await renderFor('agent')
      const results = await backend.deliver({ targets: chosen, imagePaths, text: composed, submit })
      const ok = chosen.filter((t) => results.find((r) => r.id === t.id && !r.error))
      const failed = results.filter((r) => r.error)
      try {
        localStorage.setItem(LAST_TARGETS_KEY, JSON.stringify(selected))
      } catch {}
      const at = Date.now()
      await saveAll((d) => ({ sentTo: [...d.capture.sentTo, ...ok.map((t) => ({ targetTitle: t.title, host: t.host, agent: t.agent, at, submitted: submit }))] }))
      if (message.trim()) setLastMessage(message)
      if (failed.length) {
        const names = failed.map((r) => chosen.find((t) => t.id === r.id)?.title ?? r.id)
        const reason = translateError(lang, failed[0].error ?? '')
        setStatus({ kind: 'error', message: failed.length === chosen.length ? reason : `${translate(lang, 'send.partial', { names: names.join(', ') })}. ${reason}` })
        return
      }
      setStatus({ kind: 'done', submit })
      batchDone.current = true
      const stay = !submit && settings.followOnAttach && chosen.length === 1
      setTimeout(() => {
        if (!stay || chosen[0]?.delivery.startsWith('orca')) backend.hide()
        setStatus({ kind: 'idle' })
      }, 700)
    } catch (e) {
      setStatus({ kind: 'error', message: translateError(lang, e instanceof Error ? e.message : String(e)) })
    }
  }

  const share = async (kind: ShareKind): Promise<boolean> => {
    if (!backend || !capture) return false
    try {
      const paths = await renderFor('share')
      if (kind === 'copy') await backend.copyImage(paths)
      if (kind === 'save') {
        const name = `aisight-${new Date(capture.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
        if (!(await backend.saveAs(paths, name))) return false
      }
      if (kind === 'share') await backend.share(paths, capture.source.title || 'AISight')
      if (kind === 'x') {
        const result = await backend.postToX(paths, message.trim())
        if (result === 'clipboard') setStatus({ kind: 'info', message: translate(lang, 'share.xClipboard') })
      }
      await saveAll()
      return true
    } catch (e) {
      setStatus({ kind: 'error', message: translateError(lang, e instanceof Error ? e.message : String(e)) })
      return false
    }
  }

  const updateSettings = async (patch: Partial<Settings>): Promise<string | null> => {
    if (!backend) return null
    const next = { ...settings, ...patch }
    if (patch.language && patch.language !== settings.language) {
      const prevDefaults = DEFAULT_TEMPLATES[settings.language ?? 'en']
      const untouched = settings.templates.length === prevDefaults.length && settings.templates.every((t, i) => t === prevDefaults[i])
      if (untouched) next.templates = DEFAULT_TEMPLATES[patch.language]
    }
    try {
      const saved = await backend.setSettings(next)
      setSettings(saved)
      if ('contextApp' in patch || 'contextTitle' in patch || 'contextUrl' in patch) setDrafts((ds) => ds.map((d) => ({ ...d, ctx: ctxFrom(saved) })))
      return null
    } catch (e) {
      return translateError(lang, e instanceof Error ? e.message : String(e))
    }
  }

  const primarySubmit = settings.primary === 'send'

  const demoRef = useRef({ addMark, setMarks, setSelected, setMessage, deliver, setActive })
  demoRef.current = { addMark, setMarks, setSelected, setMessage, deliver, setActive }
  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) return
    const w = window as unknown as { aisightDemo?: unknown }
    w.aisightDemo = {
      mark: (x: number, y: number, ww: number, hh: number) => demoRef.current.addMark({ x, y, w: ww, h: hh }),
      note: (n: number, text: string) => demoRef.current.setMarks((cur) => cur.map((m) => (m.n === n ? { ...m, note: text } : m))),
      select: (ids: string[]) => demoRef.current.setSelected(ids),
      message: (text: string) => demoRef.current.setMessage(text),
      pick: (i: number) => demoRef.current.setActive(i),
      attach: () => demoRef.current.deliver(false),
    }
  }, [])
  const onSubmitKey = (alt: boolean) => deliver(alt ? !primarySubmit : primarySubmit)

  useEffect(() => {
    if (!backend || view !== 'capture' || !capture) return
    let alive = true
    const tick = async () => {
      if (document.visibilityState !== 'visible' || status.kind === 'sending') return
      try {
        const list = await backend.listTargets()
        if (!alive) return
        setTargets((cur) => (cur && JSON.stringify(cur.map((t) => [t.id, t.title, t.busy])) === JSON.stringify(list.map((t) => [t.id, t.title, t.busy])) ? cur : list))
        setSelected((cur) => cur.filter((id) => list.some((t) => t.id === id)))
      } catch {}
    }
    const id = setInterval(tick, 4000)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [backend, view, capture, status.kind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement
      if (e.key === 'Escape' && !settingsOpen && !typing && !activeMark) backend?.hide()
      if (view === 'capture' && e.key === 'Enter' && !typing && !settingsOpen && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        onSubmitKey(e.ctrlKey || e.metaKey)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <LangContext.Provider value={lang}>
      <div className="relative flex h-full w-full flex-col">
        <TitleBar
          view={view}
          onView={(v) => {
            setView(v)
            setSettingsOpen(false)
          }}
          settingsOpen={settingsOpen}
          shortcut={settings.shortcut}
          onNewCapture={async () => {
            setSettingsOpen(false)
            await saveAll()
            backend?.startCapture()
          }}
          onSettings={() => setSettingsOpen((o) => !o)}
          onMinimize={() => backend?.minimize()}
          maximized={maximized}
          onToggleMaximize={async () => backend && setMaximized(await backend.toggleMaximize())}
          onClose={() => backend?.hide()}
        />
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onChange={updateSettings}
          onOpenFolder={() => backend?.openFolder()}
          onOpenUrl={(url) => backend?.openUrl(url)}
          onPickFolder={async () => {
            const folder = await backend?.pickFolder(settings.folder)
            if (folder) updateSettings({ folder })
          }}
        />
        <main className="min-h-0 flex-1">
          {view === 'history' ? (
            <History items={history} imageUrl={(p) => backend!.imageUrl(p)} onReuse={(c) => backend && load(c, backend, settings)} />
          ) : capture && backend ? (
            <div className="grid h-full grid-cols-[1fr_320px]">
              <Stage
                src={backend.imageUrl(capture.path)}
                width={capture.width}
                height={capture.height}
                marks={marks}
                activeId={activeMark}
                color={color}
                source={capture.source}
                ctx={ctx}
                onAdd={addMark}
                onUpdate={(id, patch) => setMarks((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)))}
                onRemove={removeMark}
                onActivate={setActiveMark}
                onColor={(c) => {
                  setColor(c)
                  if (activeMark) setMarks((cur) => cur.map((m) => (m.id === activeMark ? { ...m, color: c } : m)))
                }}
                onClear={() => {
                  setMarks([])
                  setActiveMark(null)
                }}
                onToggleCtx={(k) => setCtx((c) => ({ ...c, [k]: !c[k] }))}
                onSubmitKey={onSubmitKey}
                insetLeft={88}
                rail={
                  <BatchRail
                    items={drafts.map((d) => ({ id: d.capture.id, src: backend.imageUrl(d.capture.path), marks: d.marks.length }))}
                    active={Math.min(active, drafts.length - 1)}
                    onPick={(i) => {
                      setActive(i)
                      setActiveMark(null)
                    }}
                    onRemove={(i) => {
                      setDrafts((ds) => ds.filter((_, j) => j !== i))
                      setActive((a) => Math.max(0, a >= i ? a - 1 : a))
                      setActiveMark(null)
                    }}
                    onAdd={async () => {
                      await saveAll()
                      backend.startCapture()
                    }}
                  />
                }
                footer={
                  <MessageBar
                    value={message}
                    onChange={setMessage}
                    primary={settings.primary}
                    status={status}
                    canDeliver={chosen.length > 0}
                    onDeliver={deliver}
                    tools={{
                      templates: settings.templates,
                      lastMessage,
                      imagePath: drafts.map((d) => d.capture.path.replaceAll('/', '\\')).join(' '),
                      imageCount: drafts.length,
                      preview: composed,
                      clipboardText: () => backend.clipboardText(),
                      saveTemplate: (tpl) => {
                        if (!settings.templates.includes(tpl)) updateSettings({ templates: [...settings.templates, tpl] })
                      },
                    }}
                  />
                }
              />
              <SendPanel
                targets={targets}
                selected={selected}
                onToggle={(id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
                onRefresh={() => backend && refreshTargets(backend)}
                onShare={share}
              />
            </div>
          ) : (
            <Empty shortcut={settings.shortcut} lang={lang} onCapture={() => backend?.startCapture()} />
          )}
        </main>
      </div>
    </LangContext.Provider>
  )
}

function Empty({ shortcut, lang, onCapture }: { shortcut: string; lang: Lang; onCapture: () => void }) {
  return (
    <div className="stage flex h-full flex-col items-center justify-center gap-5">
      <Logo size={48} withWord={false} />
      <button type="button" onClick={onCapture} className="press h-10 rounded-md bg-primary px-5 text-[14.5px] font-semibold text-primary-ink hover:opacity-90">
        {translate(lang, 'empty.capture')}
      </button>
      <span className="flex items-center gap-1.5 text-[13.5px] text-ink-3">
        <span className="kbd">{shortcut.split('+').join(' + ')}</span> {translate(lang, 'empty.or')} <span className="kbd">Win + Shift + S</span>
      </span>
    </div>
  )
}
