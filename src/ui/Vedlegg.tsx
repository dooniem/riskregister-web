import { useEffect, useRef, useState } from 'react'
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
  start?: { filer?: File[] }
  startet?: () => void
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

interface Ktx {
  r: Risk
  okt: Okt
  endre: (...ops: Op[]) => void
  melding: (tekst: string) => void
}

// Legger lenkene til på risken slik den er nå (andre kan ha endret den mens filen ble lastet opp)
function leggTilVedlegg({ r, okt, endre }: Ktx, nye: (FilLenke & { opplastet?: boolean })[]) {
  const naa = okt.doc.risker.find((x) => x.id === r.id)
  if (!naa) return 0
  const av = okt.laas(r.id)
  if (av) throw new Error(`${av} redigerer risken akkurat nå. Prøv igjen når de er ferdige.`)
  const fra = naa.vedlegg ?? []
  const tid = new Date().toISOString()
  const tillegg: Vedlegg[] = nye.filter((n) => !fra.some((v) => v.id === n.id)).map((n) => ({ ...n, lagtTilAv: okt.mittNavn, lagtTil: tid }))
  if (tillegg.length) endre({ t: 'setRisk', riskId: r.id, felt: 'vedlegg', verdi: [...fra, ...tillegg], fra: naa.vedlegg })
  okt.slippLaas()
  return tillegg.length
}

// Laster filene opp til mappen for risken og legger dem til som vedlegg
async function lastOppVedlegg(ktx: Ktx, kilde: FilKilde, filListe: File[]) {
  const lenker: FilLenke[] = []
  for (const f of filListe) lenker.push(await kilde.lastOpp([VEDLEGG_MAPPE, `Risk ${ktx.r.nr}`], f.name, await f.arrayBuffer()))
  leggTilVedlegg(ktx, lenker.map((l) => ({ ...l, opplastet: true })))
  ktx.melding(lenker.length === 1 ? `«${lenker[0].navn}» er lastet opp og lagt til.` : `${lenker.length} filer er lastet opp og lagt til.`)
}

// Fjerner bare lenken. Filen blir liggende i dokumentbiblioteket.
function fjernVedlegg({ r, okt, endre, melding }: Ktx, v: Vedlegg) {
  const naa = okt.doc.risker.find((x) => x.id === r.id)
  if (!naa) return
  const av = okt.laas(r.id)
  if (av) return melding(`${av} redigerer risken akkurat nå.`)
  const rest = (naa.vedlegg ?? []).filter((x) => x.id !== v.id)
  endre({ t: 'setRisk', riskId: r.id, felt: 'vedlegg', verdi: rest.length ? rest : undefined, fra: naa.vedlegg })
  okt.slippLaas()
  melding(`Lenken til «${v.navn}» er fjernet. Filen ligger fortsatt i dokumentbiblioteket.`)
}

// Sletter en fil som er lastet opp fra registeret, og fjerner lenken. Brukes filen av en annen risk også, fjernes bare lenken.
async function slettVedlegg(ktx: Ktx, kilde: FilKilde, v: Vedlegg) {
  const andre = ktx.okt.doc.risker.filter((x) => x.id !== ktx.r.id && x.vedlegg?.some((y) => y.id === v.id))
  if (andre.length) {
    fjernVedlegg(ktx, v)
    return ktx.melding(`Lenken er fjernet, men «${v.navn}» ble ikke slettet fordi risk ${andre.map((x) => x.nr).join(', ')} også har den som vedlegg.`)
  }
  const av = ktx.okt.laastAv(ktx.r.id)
  if (av) return ktx.melding(`${av.navn} redigerer risken akkurat nå.`)
  await kilde.slett(v.id)
  fjernVedlegg({ ...ktx, melding: () => {} }, v)
  ktx.melding(`«${v.navn}» er slettet. Den ligger i papirkurven på SharePoint-området og kan hentes tilbake derfra.`)
}

// Fjern-knappen for ett vedlegg. Filer lastet opp fra registeret gir valget mellom å bare fjerne lenken og å slette filen.
function FjernVedlegg({ ktx, v, filer, kompakt, ferdig }: { ktx: Ktx; v: Vedlegg; filer?: () => FilKilde; kompakt?: boolean; ferdig?: () => void }) {
  const [spor, setSpor] = useState(false)
  const [sletter, setSletter] = useState(false)
  // Vedlegg lagt til før merket fantes, kjennes igjen på mappen de ligger i
  const kanSlette = (!!v.opplastet || !!v.mappeUrl?.includes(encodeURIComponent(VEDLEGG_MAPPE))) && !!filer
  const bareLenke = () => (fjernVedlegg(ktx, v), ferdig?.())
  if (!spor)
    return kompakt ? (
      <button className="vedlegg-meny-ikon" onClick={() => (kanSlette ? setSpor(true) : bareLenke())} title={kanSlette ? 'Fjern eller slett' : 'Fjern lenken. Filen blir liggende i dokumentbiblioteket.'} aria-label={`Fjern ${v.navn}`}>
        ✕
      </button>
    ) : (
      <button className="lenkeknapp" onClick={() => (kanSlette ? setSpor(true) : bareLenke())} title={kanSlette ? undefined : 'Fjerner lenken. Filen blir liggende i dokumentbiblioteket.'}>
        Fjern
      </button>
    )
  return (
    <span className="fjern-valg" role="group" aria-label={`Fjern ${v.navn}`}>
      <button className="lenkeknapp" onClick={bareLenke} disabled={sletter} title="Filen blir liggende i vedleggsmappen">
        Bare lenken
      </button>
      <button
        className="lenkeknapp fare"
        disabled={sletter}
        title="Filen slettes fra vedleggsmappen og havner i papirkurven på SharePoint-området"
        onClick={() => {
          setSletter(true)
          slettVedlegg(ktx, filer!(), v)
            .catch((err) => ktx.melding(feiltekst(err)))
            .finally(() => (setSletter(false), setSpor(false), ferdig?.()))
        }}
      >
        {sletter ? 'Sletter…' : 'Slett filen'}
      </button>
      <button className="lenkeknapp dempet" onClick={() => setSpor(false)} disabled={sletter}>
        Avbryt
      </button>
    </span>
  )
}

// Navnet på et innlimt skjermbilde: «Skjermbilde 2026-11-02 11.42.07.png»
function skjermbildeNavn(type = 'image/png') {
  const d = new Date()
  const to = (n: number) => String(n).padStart(2, '0')
  const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  return `Skjermbilde ${d.getFullYear()}-${to(d.getMonth() + 1)}-${to(d.getDate())} ${to(d.getHours())}.${to(d.getMinutes())}.${to(d.getSeconds())}.${ext}`
}

// Henter et bilde fra utklippstavlen. Nettleseren spør om lov første gang.
async function bildeFraUtklipp(): Promise<File> {
  if (!navigator.clipboard?.read) throw new Error('Nettleseren kan ikke lese bilder fra utklippstavlen herfra. Åpne risken i panelet og trykk Ctrl+V.')
  let elementer: ClipboardItems
  try {
    elementer = await navigator.clipboard.read()
  } catch {
    throw new Error('Fikk ikke lese utklippstavlen. Tillat det i nettleseren, eller åpne risken i panelet og trykk Ctrl+V.')
  }
  for (const el of elementer) {
    const type = el.types.find((t) => t.startsWith('image/'))
    if (type) {
      const blob = await el.getType(type)
      return new File([blob], skjermbildeNavn(type), { type })
    }
  }
  throw new Error('Utklippstavlen har ikke noe bilde. Ta et skjermbilde først (Windows + Shift + S), og prøv igjen.')
}

// Bilder fra en lim inn-hendelse (Ctrl+V), med navn som skjermbilde
function bilderFraLimInn(e: ClipboardEvent) {
  return [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/')).map((f) => new File([f], skjermbildeNavn(f.type), { type: f.type }))
}

const feiltekst = (err: unknown) => (err instanceof Error ? err.message : String(err))

// Filvelgeren for vedlegg, brukt både fra panelet og fra høyreklikkmenyen
function VedleggFilvelger({ ktx, kilde, lukk }: { ktx: Ktx; kilde: FilKilde; lukk: () => void }) {
  return (
    <Filvelger
      modus="vedlegg"
      kilde={kilde}
      lukk={lukk}
      pcTekst={`Lastes opp til «${VEDLEGG_MAPPE} › Risk ${ktx.r.nr}» i dokumentbiblioteket.`}
      fraPc={async (filListe) => {
        await lastOppVedlegg(ktx, kilde, filListe)
        lukk()
      }}
      valgt={async (f) => {
        const n = leggTilVedlegg(ktx, [await kilde.lenke(f.id)])
        lukk()
        ktx.melding(n ? `«${f.navn}» er lagt til.` : `«${f.navn}» er allerede lagt til.`)
      }}
    />
  )
}

// «Legg til vedlegg…» fra høyreklikkmenyen: bare filvelgeren, uten panelet
export function LeggTilVedlegg({ r, okt, endre, filer, melding, lukk }: Omit<Props, 'sperret' | 'start' | 'startet'> & { lukk: () => void }) {
  const [kilde] = useState(filer)
  return <VedleggFilvelger ktx={{ r, okt, endre, melding }} kilde={kilde} lukk={lukk} />
}

// Undermenyen «Vedlegg ›» i høyreklikkmenyen: alle vedleggene, med mappe og fjern, og «Legg til vedlegg…» nederst
export function VedleggMeny({ r, okt, endre, melding, kanSkrive, filer, leggTil, lukk }: { r: Risk; okt: Okt; endre: (...ops: Op[]) => void; melding: (tekst: string) => void; kanSkrive: boolean; filer?: () => FilKilde; leggTil: () => void; lukk: () => void }) {
  const liste = r.vedlegg ?? []
  const ktx = { r, okt, endre, melding }
  return (
    <div className="vedlegg-meny" role="menu">
      {liste.length === 0 && <p className="vedlegg-meny-tom">Ingen vedlegg ennå</p>}
      {liste.map((v) => {
        const m = typeMerke(v.navn)
        return (
          <div key={v.id} className="vedlegg-meny-rad">
            <a href={v.url} target="_blank" rel="noreferrer" role="menuitem" onClick={lukk} title={`Åpne «${v.navn}» i SharePoint`}>
              <span className={'vedlegg-type ' + m.kl} aria-hidden>
                {m.tekst}
              </span>
              <span className="vedlegg-meny-navn">{v.navn}</span>
            </a>
            {v.mappeUrl && (
              <a className="vedlegg-meny-ikon" href={v.mappeUrl} target="_blank" rel="noreferrer" onClick={lukk} title="Åpne mappen filen ligger i" aria-label={`Åpne mappen til ${v.navn}`}>
                <MappeIkon />
              </a>
            )}
            {kanSkrive && (
              <FjernVedlegg ktx={ktx} v={v} filer={filer} kompakt ferdig={lukk} />
            )}
          </div>
        )
      })}
      {kanSkrive && (
        <>
          {liste.length > 0 && <hr />}
          <button className="vedlegg-meny-legg-til" role="menuitem" onClick={leggTil}>
            + Legg til vedlegg…
          </button>
          {filer && (
            <button
              className="vedlegg-meny-legg-til"
              role="menuitem"
              title="Lagrer bildet du har kopiert (f.eks. med Windows + Shift + S) som vedlegg på risken"
              onClick={() => {
                lukk()
                bildeFraUtklipp()
                  .then((fil) => (melding(`Laster opp «${fil.name}»…`), lastOppVedlegg(ktx, filer(), [fil])))
                  .catch((err) => melding(feiltekst(err)))
              }}
            >
              + Lim inn skjermbilde
            </button>
          )}
        </>
      )}
    </div>
  )
}

function MappeIkon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

// Vedleggene til en risk i detaljpanelet: lenker til filer i dokumentbiblioteket på området.
// Filer kan velges fra biblioteket eller lastes opp (knapp eller dra og slipp). Fjern tar bort lenken, og filer som er lastet opp herfra, kan også slettes.
export function VedleggDel({ r, okt, endre, sperret, filer, melding, start, startet }: Props) {
  const [velger, setVelger] = useState<FilKilde | null>(null)
  const [drar, setDrar] = useState(false)
  const [laster, setLaster] = useState('')
  const [blink, setBlink] = useState(false)
  const del = useRef<HTMLElement>(null)
  const liste = r.vedlegg ?? []

  const ktx = { r, okt, endre, melding }
  const lastOpp = async (filListe: File[]) => {
    await lastOppVedlegg(ktx, velger ?? filer(), filListe)
    setVelger(null)
  }

  const lastOppMedStatus = (filListe: File[]) => {
    if (!filListe.length) return
    setLaster(filListe.length === 1 ? `Laster opp «${filListe[0].name}»…` : `Laster opp ${filListe.length} filer…`)
    lastOpp(filListe)
      .catch((err) => melding(feiltekst(err)))
      .finally(() => setLaster(''))
  }

  const slipp = (e: React.DragEvent) => {
    e.preventDefault()
    setDrar(false)
    if (sperret) return
    lastOppMedStatus([...e.dataTransfer.files])
  }

  // Åpnet fra høyreklikkmenyen eller med filer sluppet på raden: vis vedleggene og last opp filene
  useEffect(() => {
    if (!start) return
    del.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setBlink(true)
    const t = setTimeout(() => setBlink(false), 1200)
    if (start.filer?.length) {
      if (sperret) melding('Risken kan ikke endres akkurat nå, så filene ble ikke lastet opp.')
      else lastOppMedStatus(start.filer)
    }
    startet?.()
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])

  // Ctrl+V med panelet åpent legger til bildet fra utklippstavlen, så lenge man ikke skriver i et tekstfelt
  useEffect(() => {
    if (sperret) return
    const limInn = (e: ClipboardEvent) => {
      const m = e.target as HTMLElement | null
      if (e.defaultPrevented) return
      if (m && (m.tagName === 'INPUT' || m.tagName === 'TEXTAREA' || m.isContentEditable)) return
      const bilder = bilderFraLimInn(e)
      if (!bilder.length) return
      e.preventDefault()
      del.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      lastOppMedStatus(bilder)
    }
    window.addEventListener('paste', limInn)
    return () => window.removeEventListener('paste', limInn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sperret, r.id])

  return (
    <section
      ref={del}
      className={'vedlegg-del' + (drar ? ' drar' : '') + (blink ? ' blink' : '')}
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
                    <MappeIkon />
                    Mappe
                  </a>
                )}
                {!sperret && (
                  <FjernVedlegg ktx={ktx} v={v} filer={filer} />
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
            <button
              className="knapp"
              title="Lagrer bildet du har kopiert (f.eks. med Windows + Shift + S) som vedlegg. Ctrl+V virker også."
              onClick={() => bildeFraUtklipp().then((fil) => lastOppMedStatus([fil])).catch((err) => melding(feiltekst(err)))}
            >
              Lim inn skjermbilde
            </button>
            <span className="liten">eller dra filer hit</span>
          </div>
        )
      )}
      {velger && <VedleggFilvelger ktx={ktx} kilde={velger} lukk={() => setVelger(null)} />}
    </section>
  )
}
