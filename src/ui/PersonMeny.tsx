import { Fragment, useEffect, useRef, useState } from 'react'
import type { Register } from '../model'
import type { Visning } from '../view'
import { eierNavn } from '../view'
import { Person, Pil } from './Ikoner'

interface Props {
  doc: Register
  visning: Visning
  setVisning: (f: (v: Visning) => Visning) => void
  brukernavn: string
  ikon?: boolean
}

// Personfilter: «Der jeg er eier» og alle risiko- og tiltakseiere, med søk, for å jobbe med sin del av planen.
// Riskene brukeren følger (stjerne), vises med knappen «Følger» i Visninger-raden.
export function PersonMeny({ doc, visning, setVisning, brukernavn, ikon }: Props) {
  const [aapen, setAapen] = useState(false)
  const alle = eierNavn(doc)
  const meg = alle.find((n) => n.toLowerCase() === brukernavn.trim().toLowerCase())
  const etikett = visning.person ? (visning.person === meg ? 'Der jeg er eier' : visning.person) : 'Alle personer'
  return (
    <div className="meny-holder">
      <button
        className={'knapp person-knapp' + (visning.person ? ' aktiv' : '')}
        title="Vis bare risker der personen er risikoeier eller tiltakseier"
        aria-haspopup="listbox"
        aria-expanded={aapen}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setAapen(!aapen)}
      >
        {ikon && <Person />}
        {etikett} <Pil />
      </button>
      {aapen && (
        <PersonListe
          alle={alle}
          meg={meg}
          valgt={visning.person}
          velg={(n) => (setVisning((v) => ({ ...v, person: n })), setAapen(false))}
          lukk={() => setAapen(false)}
        />
      )}
    </div>
  )
}

function PersonListe({ alle, meg, valgt, velg, lukk }: { alle: string[]; meg?: string; valgt?: string; velg: (n?: string) => void; lukk: () => void }) {
  const [sok, setSok] = useState('')
  const [markert, setMarkert] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && lukk()
    const t = setTimeout(() => window.addEventListener('mousedown', h, true))
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', h, true)
    }
  }, [lukk])

  const s = sok.trim().toLowerCase()
  // Uten søk: Alle personer og Der jeg er eier øverst. Med søk: bare treffene.
  const valg: { navn?: string; tekst: string; forklaring?: string }[] = [
    ...(s ? [] : [{ navn: undefined, tekst: 'Alle personer' }, ...(meg ? [{ navn: meg, tekst: 'Der jeg er eier', forklaring: `Risikoeier eller tiltakseier (${meg})` }] : [])]),
    ...alle.filter((n) => n.toLowerCase().includes(s)).map((n) => ({ navn: n, tekst: n })),
  ]
  const m = Math.min(markert, Math.max(0, valg.length - 1))

  const tast = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMarkert(Math.min(valg.length - 1, m + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMarkert(Math.max(0, m - 1))
    } else if (e.key === 'Enter' && valg[m]) {
      e.preventDefault()
      velg(valg[m].navn)
    } else if (e.key === 'Escape') lukk()
  }

  return (
    <div className="nedtrekk personmeny" ref={ref}>
      <input
        autoFocus
        placeholder="Søk etter navn"
        aria-label="Søk etter person"
        value={sok}
        onChange={(e) => (setSok(e.target.value), setMarkert(0))}
        onKeyDown={tast}
      />
      <div className="person-liste" role="listbox">
        {valg.map((v, i) => (
          <Fragment key={v.navn ?? ''}>
            <button
              role="option"
              aria-selected={v.navn === valgt}
              className={(i === m ? 'markert' : '') + (v.navn === valgt ? ' valgt' : '')}
              onMouseEnter={() => setMarkert(i)}
              onClick={() => velg(v.navn)}
            >
              {v.tekst}
              {v.forklaring && <small>{v.forklaring}</small>}
            </button>
            {/* Uten treff på navnet ditt kan valget ikke brukes, men det står der, så man vet at det finnes */}
            {i === 0 && !s && !meg && (
              <div className="person-deaktivert" aria-disabled="true">
                Der jeg er eier
                <small>Du står ikke som risikoeier eller tiltakseier i registeret</small>
              </div>
            )}
          </Fragment>
        ))}
        {!valg.length && <div className="tomt-sok">Ingen treff</div>}
      </div>
    </div>
  )
}
