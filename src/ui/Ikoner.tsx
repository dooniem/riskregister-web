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
