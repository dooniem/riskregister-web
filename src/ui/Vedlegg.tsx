import { useState } from 'react'
import type { Risk, Vedlegg } from '../model'
import type { Op } from '../ops'
import type { FilKilde, FilLenke } from '../store/filer'
import type { Okt } from '../sync'
import { Filvelger } from './Filvelger'

// Mappen i dokumentbiblioteket der filer som lastes opp fra registeret havner
export const VEDLEGG_MAPPE = 'Riskregister vedlegg'

interface Props {
  r: Risk
  okt: Okt
  endre: (...ops: Op[]) => void
  sperret: boolean
  filer: () => FilKilde
  melding: (tekst: string) => void
}

// Filtypen som et kort merke foran navnet
function typeMerke(navn: string) {
  const ext = navn.split('.').pop()?.toLowerCase() ?? ''
  if (/^xls[xmb]?$|^csv$/.test(ext)) return { tekst: 'X', kl: 'excel' }
  if (/^docx?$/.test(ext)) return { tekst: 'W', kl: 'word' }
  if (/^pptx?$/.test(ext)) return { tekst: 'P', kl: 'powerpoint' }
  if (ext === 'pdf') return { tekst: 'PDF', kl: 'pdf' }
  if (/^(png|jpe?g|gif|webp|heic|bmp|tiff?)$/.test(ext)) return { tekst: 'BILDE', kl: 'bilde' }
  return { tekst: ext.slice(0, 4).toUpperCase() || 'FIL', kl: 'fil' }
}

// Vedleggene til en risk i detaljpanelet: lenker til filer i dokumentbiblioteket på området.
// Filer kan velges fra biblioteket eller lastes opp (knapp eller dra og slipp). Fjern tar bare bort lenken.
export function VedleggDel({ r, okt, endre, sperret, filer, melding }: Props) {
  const [velger, setVelger] = useState<FilKilde | null>(null)
  const [drar, setDrar] = useState(false)
  const [laster, setLaster] = useState('')
  const liste = r.vedlegg ?? []

  // Legger lenkene til på risken slik den er nå (andre kan ha endret den mens filen ble lastet opp)
  const leggTil = (nye: FilLenke[]) => {
    const naa = okt.doc.risker.find((x) => x.id === r.id)
    if (!naa) return
    const av = okt.laas(r.id)
    if (av) throw new Error(`${av} redigerer risken akkurat nå. Prøv igjen når de er ferdige.`)
    const fra = naa.vedlegg ?? []
    const tid = new Date().toISOString()
    const tillegg: Vedlegg[] = nye.filter((n) => !fra.some((v) => v.id === n.id)).map((n) => ({ ...n, lagtTilAv: okt.mittNavn, lagtTil: tid }))
    if (tillegg.length) endre({ t: 'setRisk', riskId: r.id, felt: 'vedlegg', verdi: [...fra, ...tillegg], fra: naa.vedlegg })
    okt.slippLaas()
    return tillegg.length
  }

  const lastOpp = async (filListe: File[]) => {
    const kilde = velger ?? filer()
    const lenker: FilLenke[] = []
    for (const f of filListe) lenker.push(await kilde.lastOpp([VEDLEGG_MAPPE, `Risk ${r.nr}`], f.name, await f.arrayBuffer()))
    leggTil(lenker)
    setVelger(null)
    melding(lenker.length === 1 ? `«${lenker[0].navn}» er lastet opp og lagt til.` : `${lenker.length} filer er lastet opp og lagt til.`)
  }

  const slipp = (e: React.DragEvent) => {
    e.preventDefault()
    setDrar(false)
    if (sperret) return
    const filListe = [...e.dataTransfer.files]
    if (!filListe.length) return
    setLaster(filListe.length === 1 ? `Laster opp «${filListe[0].name}»…` : `Laster opp ${filListe.length} filer…`)
    lastOpp(filListe)
      .catch((err) => melding(err instanceof Error ? err.message : String(err)))
      .finally(() => setLaster(''))
  }

  const fjern = (v: Vedlegg) => {
    const naa = okt.doc.risker.find((x) => x.id === r.id)
    if (!naa) return
    const av = okt.laas(r.id)
    if (av) return melding(`${av} redigerer risken akkurat nå.`)
    const rest = (naa.vedlegg ?? []).filter((x) => x.id !== v.id)
    endre({ t: 'setRisk', riskId: r.id, felt: 'vedlegg', verdi: rest.length ? rest : undefined, fra: naa.vedlegg })
    okt.slippLaas()
    melding(`Lenken til «${v.navn}» er fjernet. Filen ligger fortsatt i dokumentbiblioteket.`)
  }

  return (
    <section
      className={'vedlegg-del' + (drar ? ' drar' : '')}
      onDragOver={(e) => {
        if (sperret || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDrar(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrar(false)}
      onDrop={slipp}
    >
      <h3>
        Vedlegg <span className="liten">({liste.length})</span>
      </h3>
      {liste.length > 0 && (
        <ul className="vedlegg-liste">
          {liste.map((v) => {
            const m = typeMerke(v.navn)
            return (
              <li key={v.id}>
                <span className={'vedlegg-type ' + m.kl} aria-hidden>
                  {m.tekst}
                </span>
                <a href={v.url} target="_blank" rel="noreferrer" title={[v.lagtTilAv && `Lagt til av ${v.lagtTilAv}`, v.lagtTil && new Date(v.lagtTil).toLocaleDateString('nb-NO')].filter(Boolean).join(', ') || undefined}>
                  {v.navn}
                </a>
                {v.mappeUrl && (
                  <a className="vedlegg-mappe" href={v.mappeUrl} target="_blank" rel="noreferrer" title="Åpne mappen filen ligger i, i SharePoint" aria-label={`Åpne mappen til ${v.navn}`}>
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                      <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                    Mappe
                  </a>
                )}
                {!sperret && (
                  <button className="lenkeknapp" onClick={() => fjern(v)} title="Fjerner lenken. Filen blir liggende i dokumentbiblioteket.">
                    Fjern
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {laster ? (
        <p className="liten">{laster}</p>
      ) : (
        !sperret && (
          <div className="vedlegg-legg-til">
            <button className="knapp" onClick={() => setVelger(filer())}>
              + Legg til vedlegg
            </button>
            <span className="liten">eller dra filer hit</span>
          </div>
        )
      )}
      {velger && (
        <Filvelger
          modus="vedlegg"
          kilde={velger}
          lukk={() => setVelger(null)}
          pcTekst={`Lastes opp til «${VEDLEGG_MAPPE} › Risk ${r.nr}» i dokumentbiblioteket.`}
          fraPc={lastOpp}
          valgt={async (f) => {
            const n = leggTil([await velger.lenke(f.id)])
            setVelger(null)
            melding(n ? `«${f.navn}» er lagt til.` : `«${f.navn}» er allerede lagt til.`)
          }}
        />
      )}
    </section>
  )
}
