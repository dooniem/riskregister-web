export function Laas({ str = 11 }: { str?: number }) {
  return (
    <svg width={str} height={str} viewBox="0 0 16 16" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
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

export function Person({ str = 14 }: { str?: number }) {
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true" {...strek}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  )
}

// To personer: felles visninger, som alle i registeret ser
export function Felles({ str = 14 }: { str?: number }) {
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true" {...strek}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
      <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.5 15.6c1.8.7 3.1 2.2 4 4.4" />
    </svg>
  )
}

// Gammeldags nøkkel (som 🗝️) foran «Lukk risken» og «Gjenåpne risken» i høyreklikkmenyen
export function Nokkel({ str = 16 }: { str?: number }) {
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true">
      <g transform="translate(24 0) scale(-1 1)" {...strek} strokeWidth={2.4}>
        <circle cx="6.5" cy="6.5" r="3.8" />
        <path d="M9.2 9.2 20.5 20.5M18.3 18.3l-2.6 2.6M15.2 15.2l-2.6 2.6" />
      </g>
    </svg>
  )
}

// «Zzz» foran «Hvil risken» og «Vekk risken»
export function Sov({ str = 16 }: { str?: number }) {
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true" {...strek}>
      <path d="M3 12h7l-7 8h7M13 4h5l-5 6h5M18 13h3l-3 4h3" />
    </svg>
  )
}

// Åpen hengelås foran «Gjenåpne risken» i høyreklikkmenyen
export function AapenLaas({ str = 16 }: { str?: number }) {
  return (
    <svg className="ikon" width={str} height={str} viewBox="0 0 24 24" aria-hidden="true" {...strek} strokeWidth={2.2}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.7-1.5" />
    </svg>
  )
}
