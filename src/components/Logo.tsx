export function LogoMark({ size = 22, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      {tile && <rect width="64" height="64" rx="14" fill="var(--primary)" />}
      <g fill="none" stroke={tile ? 'var(--primary-ink)' : 'var(--ink)'} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 26V18a4 4 0 0 1 4-4h8" />
        <path d="M38 14h8a4 4 0 0 1 4 4v8" />
        <path d="M50 38v8a4 4 0 0 1-4 4h-8" />
        <path d="M26 50h-8a4 4 0 0 1-4-4v-8" />
      </g>
      <path d="M32 21c1.2 6.3 4.7 9.8 11 11-6.3 1.2-9.8 4.7-11 11-1.2-6.3-4.7-9.8-11-11 6.3-1.2 9.8-4.7 11-11Z" fill="#FF5A36" />
    </svg>
  )
}

export function Logo({ size = 22, withWord = true }: { size?: number; withWord?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <LogoMark size={size} />
      {withWord && (
        <span className="text-[15.5px] leading-none tracking-[-0.03em] text-ink">
          <span className="font-[750]">AI</span>
          <span className="font-[420]">Sight</span>
        </span>
      )}
    </span>
  )
}
