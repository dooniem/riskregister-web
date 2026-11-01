import { useEffect, useRef, useState } from 'react'
import type { Fag, Register } from '../model'
import { FAG_FARGER, fagFarge, kortFag, uid } from '../model'
import type { Op } from '../ops'
import type { Visning } from '../view'
import { UTEN_FAG, iFane } from '../view'
import { Pil } from './Ikoner'

export function FagMerke({ fag, onClick }: { fag: Fag; onClick?: (e: React.MouseEvent) => void }) {
  const f = fagFarge(fag)
  return (
    <span className="fagmerke" style={{ background: f.bg, color: f.fg }} title={fag.navn} onMouseDown={onClick}>
      {fag.kort || kortFag(fag.navn)}
    </span>
  )
}

function useKlikkUtenfor(lukk: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const sist = useRef(lukk)
  sist.current = lukk
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && sist.current()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && sist.current()
    setTimeout(() => window.addEventListener('mousedown', h))
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('mousedown', h)
      window.removeEventListener('keydown', k)
    }
  }, [])
  return ref
}

// Første farge som ikke er i bruk, ellers neste i rekken
const ledigFarge = (fag: Fag[]) => {
  const ledig = FAG_FARGER.findIndex((_, i) => !fag.some((f) => f.farge === i))
  return ledig >= 0 ? ledig : fag.length % FAG_FARGER.length
}

function NyttFag({ doc, endre, onLagt }: { doc: Register; endre: (op: Op) => void; onLagt?: (f: Fag) => void }) {
  const [navn, setNavn] = useState('')
  const legg = () => {
    const n = navn.trim()
    if (!n) return
    const finnes = doc.lister.fag.find((f) => f.navn.toLowerCase() === n.toLowerCase())
    if (finnes) {
      onLagt?.(finnes)
      setNavn('')
      return
    }
    const f: Fag = { id: uid(), navn: n, kort: kortFag(n), farge: ledigFarge(doc.lister.fag) }
    endre({ t: 'setListe', key: 'fag', verdi: [...doc.lister.fag, f] })
    setNavn('')
    onLagt?.(f)
  }
  return (
    <form
      className="nytt-fag"
      onSubmit={(e) => {
        e.preventDefault()
        legg()
      }}
    >
      <input placeholder="Nytt fag, f.eks. Betong" value={navn} onChange={(e) => setNavn(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <button className="knapp liten" type="submit" disabled={!navn.trim()}>
        Legg til
      </button>
    </form>
  )
}

// Liten meny for å sette fag på én risk. Åpnes fra merket i Nr.-kolonnen, høyreklikkmenyen eller detaljpanelet.
export function FagVelger({ doc, valgt, x, y, endre, velg, lukk }: { doc: Register; valgt?: string; x: number; y: number; endre: (op: Op) => void; velg: (id: string) => void; lukk: () => void }) {
  const ref = useKlikkUtenfor(lukk)
  const top = Math.min(y, window.innerHeight - 80 - 34 * (doc.lister.fag.length + 2))
  return (
    <div className="nedtrekk fagvelger" ref={ref} style={{ position: 'fixed', left: Math.min(x, window.innerWidth - 260), top: Math.max(8, top), right: 'auto' }}>
      <div className="meny-tittel">Fag</div>
      {doc.lister.fag.map((f) => (
        <button key={f.id} className={f.id === valgt ? 'valgt' : ''} onClick={() => (velg(f.id), lukk())}>
          <FagMerke fag={f} /> {f.navn}
        </button>
      ))}
      {valgt && (
        <button onClick={() => (velg(''), lukk())}>
          <span className="fagmerke tom" /> Ingen fag
        </button>
      )}
      <NyttFag doc={doc} endre={endre} onLagt={(f) => (velg(f.id), lukk())} />
    </div>
  )
}

type MenyProps = { doc: Register; visning: Visning; setVisning: (f: (v: Visning) => Visning) => void; endre: (op: Op) => void; kanSkrive: boolean }

// Fag-knappen i verktøylinja: filtrer på ett eller flere fag, og legg til, gi nytt navn, bytt farge eller slett fag
export function FagMeny(p: MenyProps) {
  const [aapen, setAapen] = useState(false)
  const valgte = p.visning.fag ?? []
  const enesteValgt = valgte.length === 1 ? p.doc.lister.fag.find((f) => f.id === valgte[0]) : undefined
  const etikett = !valgte.length ? 'Fag' : enesteValgt ? enesteValgt.navn : valgte.length === 1 ? 'Uten fag' : `Fag (${valgte.length})`
  return (
    <div className="meny-holder fag-holder">
      <button className={'knapp' + (valgte.length ? ' aktivt-filter' : '')} onMouseDown={(e) => e.stopPropagation()} onClick={() => setAapen(!aapen)}>
        {enesteValgt && <FagMerke fag={enesteValgt} />}
        {etikett} <Pil />
      </button>
      {aapen && <FagListe {...p} lukk={() => setAapen(false)} />}
    </div>
  )
}

function FagListe({ doc, visning, setVisning, endre, kanSkrive, lukk }: MenyProps & { lukk: () => void }) {
  const [rediger, setRediger] = useState(false)
  const ref = useKlikkUtenfor(lukk)
  const valgte = visning.fag ?? []
  const iBruk = doc.risker.filter((r) => iFane(r, visning.fane))
  const kjent = new Set(doc.lister.fag.map((f) => f.id))
  const antall = (id: string) => iBruk.filter((r) => (id === UTEN_FAG ? !r.fag || !kjent.has(r.fag) : r.fag === id)).length
  const bytt = (id: string) => setVisning((v) => ({ ...v, fag: (v.fag ?? []).includes(id) ? (v.fag ?? []).filter((x) => x !== id) : [...(v.fag ?? []), id] }))
  const oppdater = (id: string, endring: Partial<Fag>) => endre({ t: 'setListe', key: 'fag', verdi: doc.lister.fag.map((f) => (f.id === id ? { ...f, ...endring } : f)) })
  const slett = (id: string) => {
    endre({ t: 'setListe', key: 'fag', verdi: doc.lister.fag.filter((f) => f.id !== id) })
    setVisning((v) => ({ ...v, fag: (v.fag ?? []).filter((x) => x !== id) }))
  }
  const forNy = doc.lister.fag.find((f) => valgte.includes(f.id))
  return (
    <div className="nedtrekk fagmeny" ref={ref}>
      <div className="meny-tittel">Vis fag</div>
      {doc.lister.fag.length === 0 && <p className="liten tomt-fag">Ingen fag ennå. Legg til fag nedenfor, og sett fag på riskene ved å klikke i Nr.-kolonnen.</p>}
      {doc.lister.fag.map((f) =>
        rediger ? (
          <div key={f.id} className="fag-rediger">
            <FagMerke fag={f} />
            <input className="fag-navn" defaultValue={f.navn} onBlur={(e) => e.target.value.trim() && e.target.value !== f.navn && oppdater(f.id, { navn: e.target.value.trim() })} onKeyDown={(e) => e.stopPropagation()} />
            <input
              className="fag-kort"
              defaultValue={f.kort}
              maxLength={4}
              title="Teksten i merket (maks 4 tegn)"
              onBlur={(e) => e.target.value !== f.kort && oppdater(f.id, { kort: e.target.value.trim().slice(0, 4) })}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="fargevalg">
              {FAG_FARGER.map((c, i) => (
                <button key={c.navn} className={f.farge === i ? 'valgt' : ''} style={{ background: c.bg }} title={c.navn} aria-label={c.navn} onClick={() => oppdater(f.id, { farge: i })} />
              ))}
            </div>
            <button className="ikonknapp" title={`Slett ${f.navn}`} aria-label={`Slett ${f.navn}`} onClick={() => slett(f.id)}>
              ✕
            </button>
          </div>
        ) : (
          <label key={f.id} className="fag-valg">
            <input type="checkbox" checked={valgte.includes(f.id)} onChange={() => bytt(f.id)} />
            <FagMerke fag={f} />
            <span className="fag-tekst">{f.navn}</span>
            <span className="teller">{antall(f.id)}</span>
          </label>
        ),
      )}
      {!rediger && (
        <label className="fag-valg">
          <input type="checkbox" checked={valgte.includes(UTEN_FAG)} onChange={() => bytt(UTEN_FAG)} />
          <span className="fagmerke tom" />
          <span className="fag-tekst">Uten fag</span>
          <span className="teller">{antall(UTEN_FAG)}</span>
        </label>
      )}
      <div className="fag-bunn">
        <button className="lenkeknapp" disabled={!valgte.length} onClick={() => setVisning((v) => ({ ...v, fag: [] }))}>
          Vis alle
        </button>
        {kanSkrive && doc.lister.fag.length > 0 && (
          <button className="lenkeknapp" onClick={() => setRediger(!rediger)}>
            {rediger ? 'Ferdig' : 'Rediger fag'}
          </button>
        )}
      </div>
      <label className="fag-valg fag-vis-merker">
        <input type="checkbox" checked={!visning.skjulFag} onChange={() => setVisning((v) => ({ ...v, skjulFag: !v.skjulFag }))} />
        <span className="fag-tekst">Vis fagmerker i registeret</span>
      </label>
      {kanSkrive && <NyttFag doc={doc} endre={endre} />}
      {forNy && <p className="liten fag-hint">Nye risker du lager nå, får faget «{forNy?.navn}».</p>}
    </div>
  )
}

// Faget en ny risk skal få når fag-filteret er i bruk: det første valgte faget i listen
export function fagForNyRisk(doc: Register, visning: Visning): string | undefined {
  const valgte = visning.fag ?? []
  return doc.lister.fag.find((f) => valgte.includes(f.id))?.id
}
