import type { ContextToggles, Mark, SourceContext } from './types'
import { translate, type Lang } from './i18n'

export const MARK_COLORS = ['#FF5A36', '#2F6BFF', '#12B76A', '#F5A100', '#8B5CF6', '#EC4899'] as const

export function inkOn(color: string): string {
  return color.toUpperCase() === '#F5A100' ? '#1A1206' : '#FFFFFF'
}

export interface ComposePart {
  marks: Mark[]
  source: SourceContext
  ctx: ContextToggles
}

function origin(source: SourceContext, ctx: ContextToggles, lang: Lang): string | null {
  const o = [ctx.app ? source.app : undefined, ctx.title && source.title ? `"${source.title}"` : undefined, ctx.url ? source.url : undefined]
    .filter(Boolean)
    .join(' · ')
  return o ? `${translate(lang, 'compose.from')} ${o}` : null
}

export function composeMany(message: string, parts: ComposePart[], lang: Lang = 'en'): string {
  if (parts.length === 1) return composeText(message, parts[0].marks, parts[0].source, parts[0].ctx, lang)
  const out: string[] = []
  if (message.trim()) out.push(message.trim())
  parts.forEach((p, i) => {
    const lines = p.marks.filter((m) => m.note.trim()).map((m) => `${m.n}. ${m.note.trim()}`)
    const from = origin(p.source, p.ctx, lang)
    if (from) lines.push(from)
    if (lines.length) out.push([translate(lang, 'compose.image', { n: i + 1 }), ...lines].join('\n'))
  })
  return out.join('\n\n')
}

export function composeText(message: string, marks: Mark[], source: SourceContext, ctx: ContextToggles, lang: Lang = 'en'): string {
  const parts: string[] = []
  const body = message.trim()
  if (body) parts.push(body)

  const notes = marks.filter((m) => m.note.trim()).map((m) => `${m.n}. ${m.note.trim()}`)
  if (notes.length) parts.push(notes.join('\n'))

  const origin = [
    ctx.app ? source.app : undefined,
    ctx.title && source.title ? `"${source.title}"` : undefined,
    ctx.url ? source.url : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
  if (origin) parts.push(`${translate(lang, 'compose.from')} ${origin}`)

  return parts.join('\n\n')
}

interface RenderOptions {
  notes: boolean
}

export function markBounds(marks: Mark[], aspect: number) {
  const r = 0.012
  let minX = 0
  let minY = 0
  let maxX = 1
  let maxY = 1
  for (const m of marks) {
    const ry = r * aspect
    minX = Math.min(minX, m.x - (m.w > 0 ? 0 : r))
    minY = Math.min(minY, m.y - (m.h > 0 ? 0 : ry))
    maxX = Math.max(maxX, m.x + (m.w > 0 ? m.w : r))
    maxY = Math.max(maxY, m.y + (m.h > 0 ? m.h : ry))
  }
  return { minX, minY, maxX, maxY, expanded: minX < 0 || minY < 0 || maxX > 1 || maxY > 1 }
}

export async function renderAnnotated(src: string, marks: Mark[], opts: RenderOptions): Promise<Uint8Array> {
  const img = await loadImage(src)
  const W = img.naturalWidth
  const H = img.naturalHeight
  const unit = Math.max(1, Math.min(W, H) / 820)
  const b = markBounds(marks, W / H)
  const pad = b.expanded ? 14 * unit : 0
  const ox = -b.minX * W + pad
  const oy = -b.minY * H + pad
  const canvas = document.createElement('canvas')
  canvas.width = Math.round((b.maxX - b.minX) * W + pad * 2)
  canvas.height = Math.round((b.maxY - b.minY) * H + pad * 2)
  const ctx = canvas.getContext('2d')!
  if (b.expanded) {
    ctx.fillStyle = '#F4F3F0'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(24,23,26,0.08)'
    const step = 14 * unit
    for (let gx = step / 2; gx < canvas.width; gx += step) for (let gy = step / 2; gy < canvas.height; gy += step) ctx.fillRect(gx, gy, unit, unit)
    ctx.shadowColor = 'rgba(0,0,0,0.18)'
    ctx.shadowBlur = 10 * unit
  }
  ctx.drawImage(img, ox, oy)
  ctx.shadowBlur = 0

  const font = (px: number, weight = 600) => `${weight} ${Math.round(px * unit)}px "Geist Variable", system-ui, sans-serif`

  for (const m of marks) {
    const x = ox + m.x * W
    const y = oy + m.y * H
    const isBox = m.w > 0 && m.h > 0
    if (isBox) {
      const w = m.w * W
      const h = m.h * H
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, 3 * unit)
      ctx.lineWidth = 4 * unit
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'
      ctx.stroke()
      ctx.lineWidth = 2.25 * unit
      ctx.strokeStyle = m.color
      ctx.stroke()
    }
    const r = 9 * unit
    ctx.beginPath()
    ctx.arc(x, y, r + 1.75 * unit, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = m.color
    ctx.fill()
    ctx.fillStyle = inkOn(m.color)
    ctx.font = font(11, 700)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(m.n), x, y + 0.5 * unit)

    const note = m.note.trim()
    if (opts.notes && note) {
      ctx.font = font(13, 550)
      const padX = 8 * unit
      const tw = Math.min(ctx.measureText(note).width, canvas.width * 0.5)
      const bw = tw + padX * 2
      const bh = 24 * unit
      let bx = isBox ? x : x + r + 6 * unit
      let by = isBox ? y + m.h * H + 6 * unit : y - bh / 2
      if (by + bh > canvas.height) by = y - bh - 6 * unit
      bx = Math.min(Math.max(bx, 2), canvas.width - bw - 2)
      by = Math.max(by, 2)
      ctx.beginPath()
      ctx.roundRect(bx, by, bw, bh, 4 * unit)
      ctx.fillStyle = 'rgba(255,255,255,0.97)'
      ctx.shadowColor = 'rgba(0,0,0,0.18)'
      ctx.shadowBlur = 8 * unit
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.lineWidth = 1.25 * unit
      ctx.strokeStyle = m.color
      ctx.stroke()
      ctx.fillStyle = '#18171A'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.save()
      ctx.beginPath()
      ctx.rect(bx + padX, by, tw, bh)
      ctx.clip()
      ctx.fillText(note, bx + padX, by + bh / 2 + 0.5 * unit)
      ctx.restore()
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'),
  )
  return new Uint8Array(await blob.arrayBuffer())
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
