import type { Risk } from '../model'

const tid = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

// Hvem som opprettet, sist endret og lukket risken, og hvor den kom fra. Vises øverst i høyreklikkmenyen (langt trykk på mobil).
export function RiskInfo({ r }: { r: Risk }) {
  const linjer: [string, string | undefined, string | undefined][] = [
    ['Opprettet', r.opprettetAv, r.opprettet],
    ['Sist endret', r.endretAv, r.endret],
  ]
  if (r.status === 'Lukket') linjer.push(['Lukket', r.lukketAv, r.lukket])
  return (
    <div className="riskinfo">
      <div className="meny-tittel">Risk {r.nr}</div>
      {linjer.map(([etikett, hvem, naar]) => (
        <div key={etikett} className="riskinfo-linje">
          <span>{etikett}</span>
          <span>{hvem || naar ? [hvem, tid(naar)].filter(Boolean).join(', ') : 'ukjent'}</span>
        </div>
      ))}
      {r.kilde && (
        <div className="riskinfo-linje">
          <span>Kilde</span>
          <span>{r.kilde}</span>
        </div>
      )}
    </div>
  )
}
