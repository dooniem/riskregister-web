import { useState } from 'react'
import type { Lister, Prosjekt, Register } from '../model'
import { uid } from '../model'
import type { Bruker, Op } from '../ops'
import { demoBackend, demoRegistre } from '../store/demoBackend'
import { ListeBackend } from '../store/listeBackend'
import { GraphLister } from '../store/lister/graphLister'

type Valg = { lister: boolean; prosjekt: boolean; deltakere: boolean }

// Feltene i prosjektinfo som kan hentes. Navn, nummer og notering hører til hvert prosjekt.
const PROSJEKTFELT: (keyof Prosjekt)[] = ['eier', 'sjef', 'leder', 'fase', 'virksomhet']

const likt = (a = '', b = '') => a.trim().toLowerCase() === b.trim().toLowerCase()

// Endringene som henter oppsettet fra kilden inn i registeret
export function oppsettOps(doc: Register, kilde: Register, valg: Valg): Op[] {
  const ops: Op[] = []
  if (valg.lister) {
    for (const k of Object.keys(kilde.lister) as (keyof Lister)[]) {
      if (k === 'fag') continue
      ops.push({ t: 'setListe', key: k, verdi: structuredClone(kilde.lister[k]) })
    }
    // Fagene får beholde id-ene sine, så risker som allerede har fag, ikke mister det. Nye fag legges til.
    const nyeFag = kilde.lister.fag.filter((f) => !doc.lister.fag.some((x) => likt(x.navn, f.navn) || likt(x.kort, f.kort)))
    if (nyeFag.length) ops.push({ t: 'setListe', key: 'fag', verdi: [...doc.lister.fag, ...nyeFag.map((f) => ({ ...f, id: uid() }))] })
  }
  if (valg.prosjekt) for (const f of PROSJEKTFELT) if (kilde.prosjekt[f] && kilde.prosjekt[f] !== doc.prosjekt[f]) ops.push({ t: 'setProsjekt', felt: f, verdi: kilde.prosjekt[f] })
  if (valg.deltakere)
    for (const d of kilde.deltakere) {
      if (!d.navn.trim()) continue
      const fins = doc.deltakere.some((x) => (d.epost && x.epost && likt(x.epost, d.epost)) || likt(x.navn, d.navn))
      if (!fins) ops.push({ t: 'upsertDeltaker', deltaker: { ...d, id: uid() } })
    }
  return ops
}

// Henter kategorier, nedtrekkslister, prosjektinfo og deltakere fra et annet register
export function HentOppsett({ doc, endre, lukk, type, bruker, egetNavn }: { doc: Register; endre: (...ops: Op[]) => void; lukk: () => void; type: 'demo' | 'sharepoint'; bruker: Bruker; egetNavn: string }) {
  const andreDemo = type === 'demo' ? demoRegistre().filter((n) => n !== egetNavn) : []
  const [adresse, setAdresse] = useState(andreDemo[0] ?? '')
  const [kilde, setKilde] = useState<Register | null>(null)
  const [valg, setValg] = useState<Valg>({ lister: true, prosjekt: false, deltakere: false })
  const [jobber, setJobber] = useState(false)
  const [feil, setFeil] = useState('')

  const hent = async () => {
    setJobber(true)
    setFeil('')
    setKilde(null)
    try {
      // Lesing alene: appen lager ikke lister på området det hentes fra
      const backend = type === 'demo' ? await demoBackend(adresse, bruker) : new ListeBackend(await GraphLister.aapne(adresse.trim(), true), bruker)
      setKilde((await backend.hent()).doc)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : String(e))
    } finally {
      setJobber(false)
    }
  }

  const ops = kilde ? oppsettOps(doc, kilde, valg) : []
  const nyeDeltakere = kilde ? oppsettOps(doc, kilde, { lister: false, prosjekt: false, deltakere: true }).length : 0
  const avkrysning = (k: keyof Valg, tekst: string, hint: string) => (
    <label className="avkrysning">
      <input type="checkbox" checked={valg[k]} onChange={(e) => setValg({ ...valg, [k]: e.target.checked })} />
      <span>
        {tekst} <small>{hint}</small>
      </span>
    </label>
  )

  return (
    <div className="modal-bakgrunn" onMouseDown={(e) => e.target === e.currentTarget && lukk()}>
      <div className="modal">
        <header>
          <h2>Hent oppsett fra et annet register</h2>
          <button className="ikonknapp" onClick={lukk}>
            ✕
          </button>
        </header>
        <div className="modal-innhold skjema">
          <p className="liten">Registeret det hentes fra, blir ikke endret. Risker og tiltak hentes ikke. De kan importeres fra Excel.</p>
          {type === 'demo' ? (
            <label className="felt">
              <span>Demoregister</span>
              {andreDemo.length ? (
                <select value={adresse} onChange={(e) => (setAdresse(e.target.value), setKilde(null))}>
                  {andreDemo.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              ) : (
                <small>Det finnes ingen andre demoregistre i denne nettleseren.</small>
              )}
            </label>
          ) : (
            <label className="felt">
              <span>Adressen til området med registeret det skal hentes fra</span>
              <input value={adresse} onChange={(e) => (setAdresse(e.target.value), setKilde(null))} placeholder="https://firma.sharepoint.com/sites/Prosjekt123" />
            </label>
          )}
          {!kilde && (
            <div className="knapperad">
              <button className="knapp" disabled={jobber || !adresse.trim()} onClick={() => void hent()}>
                {jobber ? 'Henter…' : 'Hent registeret'}
              </button>
            </div>
          )}
          {feil && <div className="banner feil">{feil}</div>}
          {kilde && (
            <div className="felt">
              <span>Hva skal hentes fra «{kilde.prosjekt.navn || adresse}»?</span>
              {avkrysning('lister', 'Kategorier og nedtrekkslister', `(${kilde.lister.kategorier.length} kategorier, ${kilde.lister.fag.length} fag, egendefinerte kolonner og statuser). Erstatter listene her, men fag som finnes, beholdes.`)}
              {avkrysning('prosjekt', 'Prosjektinfo', '(eier, sjef, leder, fase og virksomhet). Navn og nummer beholdes.')}
              {avkrysning('deltakere', 'Deltakere', `(${nyeDeltakere} som ikke er deltakere her fra før)`)}
            </div>
          )}
          {kilde && (
            <div className="knapperad">
              <button className="knapp" onClick={lukk}>
                Avbryt
              </button>
              <button
                className="knapp primær"
                disabled={!ops.length}
                onClick={() => {
                  endre(...ops)
                  lukk()
                }}
              >
                {ops.length ? 'Hent inn' : 'Ingenting å hente'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
