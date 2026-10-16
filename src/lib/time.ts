import { LOCALES, translate, type Lang } from './i18n'

export function relativeTime(at: number, lang: Lang = 'en', now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: 'auto', style: 'short' })
  const s = Math.round((at - now) / 1000)
  const abs = Math.abs(s)
  if (abs < 45) return translate(lang, 'time.now')
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  return rtf.format(Math.round(s / 86400), 'day')
}

export function stamp(at: number, lang: Lang = 'en', now = Date.now()): string {
  const clock = new Intl.DateTimeFormat(LOCALES[lang], { hour: '2-digit', minute: '2-digit' })
  const day = new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'short' })
  const d = new Date(at)
  const same = new Date(now).toDateString() === d.toDateString()
  return same ? clock.format(d) : `${day.format(d)} · ${clock.format(d)}`
}
