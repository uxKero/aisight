import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ClipboardText, DocumentText, Eye, Link21, MessageText1, Save2, Send2, TickCircle } from 'iconsax-reactjs'
import { useT } from '../lib/i18n'

export interface MessageTools {
  templates: string[]
  lastMessage?: string
  imagePath: string
  imageCount: number
  preview: string
  clipboardText: () => Promise<string | null>
  saveTemplate: (text: string) => void
}

export type Status =
  | { kind: 'idle' }
  | { kind: 'sending'; submit: boolean }
  | { kind: 'done'; submit: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'info'; message: string }

interface Props {
  value: string
  onChange: (v: string) => void
  tools: MessageTools
  primary: 'attach' | 'send'
  status: Status
  canDeliver: boolean
  onDeliver: (submit: boolean) => void
}

interface Item {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  run: () => Promise<string | null> | string | null
  keepBody?: boolean
}

const EASE = [0.23, 1, 0.32, 1] as const

function fold(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function MessageBar({ value, onChange, tools, primary, status, canDeliver, onDeliver }: Props) {
  const t = useT()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const primarySubmit = primary === 'send'

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 110)}px`
  }, [value])

  const token = useMemo(() => {
    const m = /(^|\s)\/([^\s/]*)$/.exec(value.slice(0, caret))
    if (!m) return null
    return { start: caret - m[2].length - 1, query: m[2] }
  }, [value, caret])

  const items: Item[] = useMemo(() => {
    if (!token) return []
    const icon = (I: typeof DocumentText) => <I size={16} variant="Linear" color="currentColor" />
    const list: Item[] = tools.templates.map((tpl, i) => ({ id: `tpl-${i}`, label: tpl, icon: icon(MessageText1), run: () => tpl }))
    list.push({
      id: 'clip',
      label: t('cmd.clip'),
      hint: t('cmd.clipHint'),
      icon: icon(ClipboardText),
      run: async () => {
        const text = await tools.clipboardText()
        return text ? `\n\`\`\`\n${text.trim()}\n\`\`\`\n` : null
      },
    })
    if (tools.lastMessage) list.push({ id: 'last', label: t('cmd.last'), hint: tools.lastMessage, icon: icon(DocumentText), run: () => tools.lastMessage! })
    list.push({ id: 'path', label: t('cmd.path'), icon: icon(Link21), run: () => tools.imagePath })
    const body = (value.slice(0, token.start) + value.slice(caret)).trim()
    if (body) list.push({ id: 'save', label: t('cmd.save'), hint: body, icon: icon(Save2), keepBody: true, run: () => (tools.saveTemplate(body), '') })
    const q = fold(token.query)
    return q ? list.filter((it) => fold(it.label).includes(q)) : list
  }, [token, tools, value, caret, t])

  const open = !!token && items.length > 0 && dismissed !== `${token.start}`
  const sel = Math.min(active, Math.max(items.length - 1, 0))

  const pick = async (it: Item) => {
    if (!token) return
    const insert = (await it.run()) ?? ''
    const before = value.slice(0, token.start)
    const after = value.slice(caret)
    const next = it.keepBody ? (before + after).replace(/\s+$/, '') : before + insert + after
    onChange(next)
    const pos = it.keepBody ? next.length : before.length + insert.length
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
    setActive(0)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
        return
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault()
        pick(items[sel])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setDismissed(`${token!.start}`)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onDeliver(e.ctrlKey || e.metaKey ? !primarySubmit : primarySubmit)
    }
  }

  const sync = () => setCaret(ref.current?.selectionStart ?? 0)

  return (
    <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="relative w-full max-w-[760px]">
        <AnimatePresence>
          {open && (
            <motion.div
              key="menu"
              role="listbox"
              aria-label={t('msg.commands')}
              className="floating scroll-quiet absolute bottom-[calc(100%+8px)] left-0 w-[360px] overflow-y-auto rounded-lg p-1"
              style={{ maxHeight: 280, transformOrigin: 'bottom left' }}
              initial={{ opacity: 0, transform: 'translateY(4px) scale(0.98)' }}
              animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.16, ease: EASE }}
            >
              {items.map((it, i) => (
                <button
                  key={it.id}
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(it)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left ${i === sel ? 'bg-selected text-ink' : 'text-ink-2'}`}
                >
                  <span className="shrink-0 text-ink-3">{it.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{it.label}</span>
                  {it.hint && <span className="max-w-[120px] shrink-0 truncate text-[12.5px] text-ink-3">{it.hint}</span>}
                </button>
              ))}
            </motion.div>
          )}
          {preview && !open && (
            <motion.div
              key="preview"
              className="floating scroll-quiet absolute right-0 bottom-[calc(100%+8px)] max-h-[260px] w-[420px] overflow-y-auto rounded-lg px-4 py-3"
              style={{ transformOrigin: 'bottom right' }}
              initial={{ opacity: 0, transform: 'translateY(4px) scale(0.98)' }}
              animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.16, ease: EASE }}
            >
              <h4 className="mb-1.5 text-[12.5px] font-medium text-ink-3">{t('msg.preview')}</h4>
              <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink">
                <span className="mr-1 rounded-[4px] bg-selected px-1.5 py-px text-[12.5px] text-ink-2">{tools.imageCount > 1 ? t('msg.previewImages', { n: tools.imageCount }) : t('msg.previewImage')}</span>
                {tools.preview || <span className="text-ink-3">{t('msg.previewOnlyImage')}</span>}
              </p>
            </motion.div>
          )}
          {(status.kind === 'error' || status.kind === 'info') && (
            <motion.p
              key="error"
              className={`absolute right-0 bottom-[calc(100%+8px)] max-w-[420px] rounded-md px-3 py-2 text-[13px] leading-snug shadow-lg ${status.kind === 'error' ? 'bg-bad text-white' : 'bg-primary text-primary-ink'}`}
              initial={{ opacity: 0, transform: 'translateY(4px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.16, ease: EASE }}
            >
              {status.message}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="floating flex w-full items-end gap-1.5 rounded-lg py-1.5 pr-1.5 pl-3.5">
          <textarea
            ref={ref}
            value={value}
            rows={1}
            onChange={(e) => {
              onChange(e.target.value)
              setCaret(e.target.selectionStart)
              setDismissed(null)
            }}
            onSelect={sync}
            onClick={sync}
            onKeyUp={(e) => {
              if (e.key.startsWith('Arrow') && !open) sync()
            }}
            onKeyDown={onKeyDown}
            placeholder={t('msg.placeholder')}
            spellCheck={false}
            aria-label={t('msg.placeholder')}
            className="scroll-quiet min-h-[34px] flex-1 resize-none py-[6px] text-[14.5px] leading-[22px] placeholder:text-ink-3"
          />
          <button
            type="button"
            aria-label={t('msg.preview')}
            aria-pressed={preview}
            title={t('msg.preview')}
            onClick={() => setPreview((v) => !v)}
            className={`press flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md ${preview ? 'bg-selected text-ink' : 'text-ink-3 hover:bg-hover hover:text-ink'}`}
          >
            <Eye size={18} variant="Linear" color="currentColor" />
          </button>
          <DeliverButton submit={!primarySubmit} status={status} disabled={!canDeliver} onClick={() => onDeliver(!primarySubmit)} />
          <DeliverButton submit={primarySubmit} primary status={status} disabled={!canDeliver} onClick={() => onDeliver(primarySubmit)} />
        </div>
      </div>
    </div>
  )
}

function DeliverButton({ submit, primary, status, disabled, onClick }: { submit: boolean; primary?: boolean; status: Status; disabled: boolean; onClick: () => void }) {
  const t = useT()
  const done = status.kind === 'done' && status.submit === submit
  const busy = status.kind === 'sending' && status.submit === submit
  const label = done ? t(submit ? 'send.sent' : 'send.attached') : t(submit ? 'send.send' : 'send.attach')
  const hint = primary ? 'Enter' : 'Ctrl + Enter'
  return (
    <button
      type="button"
      title={`${label}  ·  ${hint}`}
      disabled={disabled || status.kind === 'sending'}
      onClick={onClick}
      className={`press flex h-[34px] shrink-0 items-center gap-1.5 rounded-md px-3 text-[14px] disabled:opacity-40 ${
        primary ? 'bg-primary font-semibold text-primary-ink hover:opacity-90' : 'font-medium text-ink-2 hover:bg-hover hover:text-ink'
      }`}
    >
      {done ? <TickCircle size={16} variant="Bold" color="currentColor" /> : submit ? <Send2 size={16} variant="Linear" color="currentColor" /> : <Paperclip />}
      <span className={busy ? 'opacity-60' : ''}>{label}</span>
    </button>
  )
}

function Paperclip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="m20.2 11.4-7.9 7.9a5.2 5.2 0 0 1-7.4-7.4l8.4-8.4a3.5 3.5 0 0 1 4.9 4.9l-8.3 8.4a1.7 1.7 0 0 1-2.5-2.5l7.6-7.6" />
    </svg>
  )
}
