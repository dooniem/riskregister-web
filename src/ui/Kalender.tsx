import { useEffect, useState } from 'react'
import { isoUke } from '../columns'

const MANEDER = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']
const DAGER = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø']

const isoAv = (d: Date) => d.toISOString().slice(0, 10)
const lokalIdag = () => {
  const n = new Date()
  return isoAv(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())))
}

// Månedskalender med ISO-ukenummer i første kolonne. Uken starter på mandag.
export function Kalender({ verdi, onVelg }: { verdi: string; onVelg: (iso: string) => void }) {
  const idag = lokalIdag()
  const startFra = (v: string) => {
    const d = new Date((v || idag) + 'T00:00:00Z')
    return { aar: d.getUTCFullYear(), mnd: d.getUTCMonth() }
  }
  const [vis, setVis] = useState(() => startFra(verdi))
  // Kalenderen følger med når man skriver en dato i feltet
  useEffect(() => {
    if (verdi) setVis(startFra(verdi))
  }, [verdi])

  const forste = new Date(Date.UTC(vis.aar, vis.mnd, 1))
  const start = new Date(forste.getTime() - ((forste.getUTCDay() + 6) % 7) * 86400000)
  const uker: Date[][] = []
  for (let u = 0; u < 6; u++) {
    const rad = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + (u * 7 + i) * 86400000))
    if (u > 3 && rad[0].getUTCMonth() !== vis.mnd) break
    uker.push(rad)
  }
  const bla = (n: number) => setVis((v) => ({ aar: v.aar + Math.floor((v.mnd + n) / 12), mnd: (((v.mnd + n) % 12) + 12) % 12 }))

  return (
    <div className="kalender" onMouseDown={(e) => e.preventDefault()}>
      <div className="kal-topp">
        <button type="button" onClick={() => bla(-1)} title="Forrige måned" aria-label="Forrige måned">
          ‹
        </button>
        <span>
          {MANEDER[vis.mnd]} {vis.aar}
        </span>
        <button type="button" onClick={() => bla(1)} title="Neste måned" aria-label="Neste måned">
          ›
        </button>
      </div>
      {/* Div-rutenett i stedet for tabell, så tabellstilene i registeret ikke smitter over */}
      <div className="kal-rutenett">
        <span className="kal-uke kal-hode">Uke</span>
        {DAGER.map((d) => (
          <span key={d} className="kal-hode">
            {d}
          </span>
        ))}
        {uker.map((rad) => [
          <span key={'u' + isoAv(rad[0])} className="kal-uke">
            {isoUke(isoAv(rad[0])).uke}
          </span>,
          ...rad.map((d) => {
            const iso = isoAv(d)
            const kl = [d.getUTCMonth() !== vis.mnd ? 'annen' : '', iso === idag ? 'idag' : '', iso === verdi ? 'valgt' : '', d.getUTCDay() % 6 === 0 ? 'helg' : ''].join(' ')
            return (
              <button key={iso} type="button" className={kl} onClick={() => onVelg(iso)}>
                {d.getUTCDate()}
              </button>
            )
          }),
        ])}
      </div>
      <div className="kal-bunn">
        <button type="button" onClick={() => onVelg(idag)}>
          I dag
        </button>
        <button type="button" onClick={() => onVelg('')}>
          Tøm
        </button>
      </div>
    </div>
  )
}
