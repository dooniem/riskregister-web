import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTall } from '../columns'
import type { Register, Risk } from '../model'
import { eksponering, eksponeringFarge } from '../model'
import type { Op } from '../ops'
import type { SnapshotInfo, Snapshots } from '../store/backend'
import type { Okt } from '../sync'
import { summer } from '../view'
import { StorMatrise } from './StorMatrise'

type Mot = { info: SnapshotInfo; doc: Register }

interface Props {
  doc: Register
  rm: 'R' | 'M'
  mot: Mot | null
  setMot: (m: Mot | null) => void
  snapshots?: Snapshots
  okt: Okt
  endre: (...ops: Op[]) => void
  kanSkrive: boolean
  detalj: (riskId: string, lukk: () => void) => ReactNode
  melding: (tekst: string) => void
  // Åpner vinduet der man tar et nytt snapshot
  taSnapshot: () => void
  // Er det allerede valgt et snapshot automatisk én gang, velges det ikke på nytt (brukeren kan ha valgt «ingen»)
  autoValgt: { current: boolean }
  // Øker når snapshotvinduet lukkes, så et snapshot som nettopp er tatt kommer med i listen
  oppdatert: number
}

const dato = (iso: string) => new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })
const aapen = (r: Risk) => r.status !== 'Lukket' && (r.rm === 'R' || r.rm === 'M')

interface Endring {
  r: Risk
  fra: number // eksponering i snapshotet, 0 for nye
  til: number // eksponering nå, 0 for lukkede og fjernede
  type: 'ny' | 'flyttet' | 'lukket'
}

// Risker som har fått ny eksponering, er nye eller er lukket siden snapshotet. Størst endring først.
function endringer(naa: Risk[], mot: Register): Endring[] {
  const gamle = new Map(mot.risker.map((r) => [r.id, r]))
  const ut: Endring[] = []
  const her = new Set<string>()
  for (const r of naa) {
    her.add(r.id)
    const g = gamle.get(r.id)
    if (!g || !aapen(g)) ut.push({ r, fra: 0, til: eksponering(r), type: 'ny' })
    else if (eksponering(g) !== eksponering(r) || g.sannsynlighet !== r.sannsynlighet || g.konsekvens !== r.konsekvens)
      ut.push({ r, fra: eksponering(g), til: eksponering(r), type: 'flyttet' })
  }
  for (const g of mot.risker) if (aapen(g) && !her.has(g.id)) ut.push({ r: g, fra: eksponering(g), til: 0, type: 'lukket' })
  const vekt = (e: Endring) => (e.type === 'flyttet' ? Math.abs(e.til - e.fra) + 100 : e.type === 'ny' ? 50 + e.til : e.fra)
  return ut.sort((a, b) => vekt(b) - vekt(a) || a.r.nr - b.r.nr)
}

function Merke({ rm, e }: { rm: 'R' | 'M'; e: number }) {
  const f = eksponeringFarge(rm, e)
  return (
    <span className={'eksp-merke' + (e ? '' : ' tom')} style={f ? { background: f.bg, color: f.fg } : undefined}>
      {e || '–'}
    </span>
  )
}

// Moderne visning: risikobildet som egen side ved siden av registeret. Hovedsaken er hva som har endret seg siden et snapshot,
// f.eks. siden forrige gjennomgang.
export function Risikobilde(p: Props) {
  const [liste, setListe] = useState<SnapshotInfo[] | null>(null)
  const [henter, setHenter] = useState(false)
  const [feil, setFeil] = useState('')
  const [fokus, setFokus] = useState<{ riskId: string; n: number } | undefined>()

  const velg = async (id: string) => {
    if (!id) return p.setMot(null)
    if (!p.snapshots) return
    setHenter(true)
    setFeil('')
    try {
      p.setMot(await p.snapshots.hent(id))
    } catch (e) {
      setFeil(e instanceof Error ? e.message : String(e))
    } finally {
      setHenter(false)
    }
  }

  // Siste verdier for effekten under, så listen ikke hentes på nytt for hver endring
  const siste = useRef({ velg, mot: p.mot, autoValgt: p.autoValgt })
  useEffect(() => {
    siste.current = { velg, mot: p.mot, autoValgt: p.autoValgt }
  })
  const motId = p.mot?.info.id
  useEffect(() => {
    if (!p.snapshots) return
    let avbrutt = false
    p.snapshots.liste().then(
      (l) => {
        if (avbrutt) return
        const sortert = [...l].sort((a, b) => b.tidspunkt.localeCompare(a.tidspunkt))
        setListe(sortert)
        // Første gang siden åpnes, sammenlignes det med det nyeste snapshotet
        const { velg, mot, autoValgt } = siste.current
        if (!mot && !autoValgt.current && sortert.length) {
          autoValgt.current = true
          void velg(sortert[0].id)
        }
      },
      (e) => !avbrutt && setFeil(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      avbrutt = true
    }
    // Listen hentes på nytt når et nytt snapshot er valgt, så et snapshot som nettopp er tatt kommer med
  }, [p.snapshots, motId, p.oppdatert])

  const naa = useMemo(() => p.doc.risker.filter(aapen), [p.doc])
  const sumNaa = { R: summer(naa, 'R'), M: summer(naa, 'M') }
  const gamle = p.mot ? p.mot.doc.risker.filter(aapen) : null
  const sumFor = gamle && { R: summer(gamle, 'R'), M: summer(gamle, 'M') }
  const endr = useMemo(() => (p.mot ? endringer(naa, p.mot.doc) : []), [naa, p.mot])
  const motRisker = useMemo(() => (p.mot ? new Map(p.mot.doc.risker.map((r) => [r.id, r])) : undefined), [p.mot])

  const delta = (naa: number, foer: number | undefined, merBra: boolean) => {
    if (foer === undefined) return null
    const d = Math.round(naa - foer)
    if (!d) return <span className="rb-delta">uendret</span>
    const bra = merBra ? d > 0 : d < 0
    return <span className={'rb-delta ' + (bra ? 'bedre' : 'verre')}>{(d > 0 ? '+' : '−') + formatTall(Math.abs(d))}</span>
  }
  const netto = (s: { R: { fv: number }; M: { fv: number } }) => s.R.fv - s.M.fv

  const verre = endr.filter((e) => e.type === 'flyttet' && (e.r.rm === 'M' ? e.til < e.fra : e.til > e.fra)).length
  const bedre = endr.filter((e) => e.type === 'flyttet' && (e.r.rm === 'M' ? e.til > e.fra : e.til < e.fra)).length
  const nye = endr.filter((e) => e.type === 'ny').length
  const lukket = endr.filter((e) => e.type === 'lukket').length

  return (
    <div className="risikobilde">
      <div className="rb-hode">
        <div>
          <h2>Risikobilde</h2>
          <p>
            {p.mot
              ? `Slik står prosjektet nå, sammenlignet med «${p.mot.info.navn}» fra ${dato(p.mot.info.tidspunkt)}.`
              : 'Slik står prosjektet nå. Velg et snapshot for å se hva som har endret seg.'}
          </p>
        </div>
        {p.snapshots && (
          <div className="rb-velg">
            <label className="velg">
              Sammenlign med
              <select value={p.mot?.info.id ?? ''} disabled={henter || !liste} onChange={(e) => void velg(e.target.value)}>
                <option value="">{liste?.length === 0 ? 'Ingen snapshots ennå' : 'Ingen sammenligning'}</option>
                {liste?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.navn} ({new Date(s.tidspunkt).toLocaleDateString('nb-NO')})
                  </option>
                ))}
              </select>
            </label>
            {p.kanSkrive && (
              <button className="knapp" onClick={p.taSnapshot}>
                Snapshots…
              </button>
            )}
          </div>
        )}
      </div>
      {feil && <div className="banner feil">{feil}</div>}

      <div className="rb-rutenett">
        <StorMatrise
          inline
          doc={p.doc}
          risker={naa}
          rm={p.rm}
          mot={p.mot && motRisker ? { navn: p.mot.info.navn, risker: motRisker } : undefined}
          okt={p.okt}
          endre={p.endre}
          kanSkrive={p.kanSkrive}
          detalj={p.detalj}
          melding={p.melding}
          lukk={() => {}}
          fokus={fokus}
        />

        <div className="rb-kolonne">
          <section className="kort rb-kost">
            <h3>Forventet kost</h3>
            <p className="rb-under">Forventet verdi i 1000 kr, alle åpne poster{sumFor ? `. Endring siden ${dato(p.mot!.info.tidspunkt)}.` : '.'}</p>
            <dl>
              <div>
                <dt>
                  Risiko
                  <small>
                    {sumNaa.R.antall} poster, verst tenkelig {formatTall(sumNaa.R.wc)}
                  </small>
                </dt>
                <dd>{formatTall(sumNaa.R.fv)}</dd>
                {delta(sumNaa.R.fv, sumFor?.R.fv, false)}
              </div>
              <div>
                <dt>
                  Mulighet
                  <small>
                    {sumNaa.M.antall} poster, best tenkelig {formatTall(sumNaa.M.wc)}
                  </small>
                </dt>
                <dd>{formatTall(sumNaa.M.fv)}</dd>
                {delta(sumNaa.M.fv, sumFor?.M.fv, true)}
              </div>
              <div className="netto">
                <dt>
                  Netto
                  <small>Risiko minus mulighet</small>
                </dt>
                <dd>{formatTall(netto(sumNaa))}</dd>
                {delta(netto(sumNaa), sumFor ? netto(sumFor) : undefined, false)}
              </div>
            </dl>
          </section>

          <section className="kort rb-endringer">
            {p.mot ? (
              <>
                <h3>Største endringer</h3>
                <p className="rb-under">
                  Siden {dato(p.mot.info.tidspunkt)}:{' '}
                  {endr.length
                    ? [verre && `${verre} verre`, bedre && `${bedre} bedre`, nye && `${nye} ${nye === 1 ? 'ny' : 'nye'}`, lukket && `${lukket} lukket`]
                        .filter(Boolean)
                        .join(', ')
                    : 'ingen risker har flyttet seg.'}
                </p>
                {endr.length > 0 && (
                  <ul>
                    {endr.map((e) => {
                      const rm = e.r.rm === 'M' ? 'M' : 'R'
                      return (
                        <li key={e.r.id}>
                          <button
                            className="rb-endring"
                            disabled={e.type === 'lukket'}
                            onClick={() => setFokus((f) => ({ riskId: e.r.id, n: (f?.n ?? 0) + 1 }))}
                            title={e.type === 'lukket' ? 'Lukket eller fjernet siden snapshotet' : 'Vis risken i matrisen'}
                          >
                            <span className="rb-nr">
                              {rm}
                              {e.r.nr}
                            </span>
                            <span className="rb-tekst">{e.r.hendelse || e.r.aarsak || 'Uten tekst'}</span>
                            <span className="rb-fra-til">
                              {e.type === 'ny' ? <span className="rb-ny">Ny</span> : <Merke rm={rm} e={e.fra} />}
                              <span className="rb-pil" aria-label="til">
                                til
                              </span>
                              {e.type === 'lukket' ? <span className="rb-ny">Lukket</span> : <Merke rm={rm} e={e.til} />}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            ) : (
              <div className="rb-tom">
                <h3>Ingen sammenligning ennå</h3>
                {!p.snapshots ? (
                  <p>Snapshots er ikke satt opp for dette registeret, så det er ingenting å sammenligne med.</p>
                ) : liste && liste.length === 0 ? (
                  <>
                    <p>
                      Risikobildet blir mest nyttig når det kan sammenlignes med forrige gjennomgang. Ta et snapshot når gjennomgangen er ferdig. Neste gang ser dere her
                      hvilke risker som er blitt verre eller bedre, hvilke som er nye, og hva som er lukket.
                    </p>
                    {p.kanSkrive && (
                      <button className="knapp primær" onClick={p.taSnapshot}>
                        Ta snapshot nå
                      </button>
                    )}
                  </>
                ) : (
                  <p>Velg et snapshot øverst til høyre for å se hvilke risker som er blitt verre eller bedre, hvilke som er nye, og hva som er lukket siden da.</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
