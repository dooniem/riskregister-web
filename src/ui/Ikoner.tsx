export function Laas() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
      <path d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 0 0-4 0v2z" fill="currentColor" />
    </svg>
  )
}

export function Sky({ status }: { status: string }) {
  const c = status === 'lagret' ? '#2b8a3e' : status === 'lagrer' ? '#1971c2' : '#c92a2a'
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5" fill={c} />
    </svg>
  )
}

// Tegnede ikoner i samme strek, i stedet for tegn som ▾ og ☰ (de ser forskjellige ut fra font til font)
const strek = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function Pil({ retning = 'ned', str = 12 }: { retning?: 'ned' | 'hoyre' | 'venstre'; str?: number }) {
  const d = { ned: 'm6 9 6 6 6-6', hoyre: 'm9 6 6 6-6 6', venstre: 'm15 6-6 6 6 6' }[retning]
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true" {...strek}>
      <path d={d} />
    </svg>
  )
}

export function Meny({ str = 14 }: { str?: number }) {
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true" {...strek}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function Utvid({ str = 12 }: { str?: number }) {
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true" {...strek}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}

export function Pluss({ str = 14 }: { str?: number }) {
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true" {...strek}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function Kolonneikon({ str = 14 }: { str?: number }) {
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true" {...strek}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </svg>
  )
}
