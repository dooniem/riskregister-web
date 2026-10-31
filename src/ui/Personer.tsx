import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Deltaker } from '../model'
import { uid } from '../model'
import type { Op } from '../ops'
import type { Katalog, Person } from '../store/katalog'
import { finnPerson } from '../store/katalog'
import { TrengerSamtykke } from '../store/auth'

// Søk i organisasjonen og å legge personer til som deltakere. Gis av RegisterView, null når registeret ikke kan endres.
export interface Personer {
  katalog: Katalog
  leggTil: (p: Person) => void
}

export const PersonKontekst = createContext<Personer | null>(null)
export const usePersoner = () => useContext(PersonKontekst)

export const initialer = (navn: string) =>
  navn
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((d) => d[0].toUpperCase())
    .join('')
    .slice(0, 3)

export const likNavn = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

// Operasjonen som legger personen til som deltaker, eller kobler en deltaker med samme navn. null når den allerede er koblet.
export function deltakerOp(deltakere: Deltaker[], p: Person): Op | null {
  const epost = p.epost.toLowerCase()
  const fins = deltakere.find((d) => d.epost?.toLowerCase() === epost) ?? deltakere.find((d) => !d.epost && likNavn(d.navn, p.navn))
  if (fins) return fins.epost ? null : { t: 'upsertDeltaker', deltaker: { ...fins, epost: p.epost } }
  return { t: 'upsertDeltaker', deltaker: { id: uid(), initialer: initialer(p.navn), navn: p.navn, rolleProsjekt: '', rolleRisk: '', epost: p.epost } }
}

// Søker i organisasjonen mens brukeren skriver (fra to tegn, med litt forsinkelse)
export function useOrgSok(katalog: Katalog | null | undefined, tekst: string) {
  const [svar, setSvar] = useState<{ tekst: string; treff: Person[]; feil: string; samtykke?: boolean }>({ tekst: '', treff: [], feil: '' })
  const [runde, setRunde] = useState(0)
  const t = tekst.trim()
  useEffect(() => {
    if (!katalog || t.length < 2) return
    let aktiv = true
    const tid = setTimeout(() => {
      katalog
        .sok(t)
        .then((treff) => aktiv && setSvar({ tekst: t, treff, feil: '' }))
        .catch((e) => aktiv && setSvar({ tekst: t, treff: [], feil: e instanceof Error ? e.message : String(e), samtykke: e instanceof TrengerSamtykke }))
    }, 250)
    return () => {
      aktiv = false
      clearTimeout(tid)
    }
  }, [katalog, t, runde])
  const gjeldende = !!katalog && t.length >= 2 && svar.tekst === t
  // Gi samtykke (fra et klikk) og søk på nytt
  const giSamtykke = () =>
    void katalog
      ?.samtykke?.()
      .then(() => {
        setSvar({ tekst: '', treff: [], feil: '' })
        setRunde((r) => r + 1)
      })
      .catch((e) => setSvar({ tekst: t, treff: [], feil: e instanceof Error ? e.message : String(e) }))
  return {
    treff: gjeldende ? svar.treff : [],
    feil: gjeldende ? svar.feil : '',
    samtykke: gjeldende && !!svar.samtykke ? giSamtykke : undefined,
    laster: !!katalog && t.length >= 2 && svar.tekst !== t,
  }
}

// Søkefelt for risikoeier og tiltakseier i detaljpanelet: deltakerne først, deretter personer i organisasjonen
export function PersonFelt({
  verdi,
  deltakere,
  sperret,
  onFokus,
  onBlur,
  onEndre,
}: {
  verdi: string
  deltakere: string[]
  sperret: boolean
  onFokus: () => boolean
  onBlur: () => void
  onEndre: (v: string) => void
}) {
  const personer = usePersoner()
  const [lokal, setLokal] = useState(verdi)
  const [aapen, setAapen] = useState(false)
  const [markert, setMarkert] = useState(-1)
  const endret = useRef(false)
  useEffect(() => setLokal(verdi), [verdi])

  const s = endret.current ? lokal.trim().toLowerCase() : ''
  const egne = deltakere.filter((v) => !s || v.toLowerCase().includes(s))
  const org = useOrgSok(aapen ? personer?.katalog : null, endret.current ? lokal : '')
  const fraOrg = org.treff.filter((p) => !deltakere.some((d) => likNavn(d, p.navn)))
  const alle: { navn: string; person?: Person }[] = [...egne.map((navn) => ({ navn })), ...fraOrg.map((p) => ({ navn: p.navn, person: p }))]

  const velg = (v: { navn: string; person?: Person }) => {
    if (v.person) personer?.leggTil(v.person)
    setLokal(v.navn)
    endret.current = false
    setAapen(false)
    onEndre(v.navn)
  }

  return (
    <div className="personfelt">
      <input
        value={lokal}
        disabled={sperret}
        onFocus={(e) => {
          if (!onFokus()) e.currentTarget.blur()
          else setAapen(true)
        }}
        onChange={(e) => {
          endret.current = true
          setLokal(e.target.value)
          setAapen(true)
          setMarkert(e.target.value.trim() ? 0 : -1)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setMarkert((m) => Math.max(0, Math.min(alle.length - 1, m + (e.key === 'ArrowDown' ? 1 : -1))))
          } else if (e.key === 'Enter' && aapen && alle[markert]) {
            e.preventDefault()
            velg(alle[markert])
          } else if (e.key === 'Escape' && aapen) {
            // Lukker bare lista, ikke dialogen eller panelet feltet står i
            e.preventDefault()
            e.stopPropagation()
            setAapen(false)
          }
        }}
        onBlur={() => {
          setAapen(false)
          endret.current = false
          if (lokal !== verdi) onEndre(lokal)
          onBlur()
        }}
      />
      {aapen && (alle.length > 0 || org.laster || org.feil) && (
        <ul className="valgliste" onMouseDown={(e) => e.preventDefault()}>
          {alle.map((v, i) => (
            <PersonLinje key={(v.person ? 'o:' : 'd:') + v.navn + i} v={v} forsteOrg={!!v.person && i === egne.length} markert={i === markert} onHover={() => setMarkert(i)} onVelg={() => velg(v)} />
          ))}
          {org.laster && <li className="valgliste-info">Søker i organisasjonen…</li>}
          <OrgFeil org={org} />
        </ul>
      )}
    </div>
  )
}

// Feil fra søket i organisasjonen, med knapp for å gi samtykke når det mangler
export function OrgFeil({ org }: { org: ReturnType<typeof useOrgSok> }) {
  if (!org.feil) return null
  return (
    <li className="valgliste-info feil">
      {org.feil}{' '}
      {org.samtykke && (
        <button className="lenkeknapp" onClick={org.samtykke}>
          Gi samtykke
        </button>
      )}
    </li>
  )
}

export function PersonLinje({ v, forsteOrg, markert, onHover, onVelg }: { v: { navn: string; person?: Person }; forsteOrg: boolean; markert: boolean; onHover: () => void; onVelg: () => void }) {
  return (
    <>
      {forsteOrg && <li className="valgliste-overskrift">Fra organisasjonen (legges til som deltaker)</li>}
      <li className={markert ? 'markert' : ''} onMouseEnter={onHover} onClick={onVelg}>
        {v.person && <span className="pluss">+ </span>}
        {v.navn}
        {v.person && <span className="liten"> {[v.person.stilling, v.person.epost].filter(Boolean).join(' · ')}</span>}
      </li>
    </>
  )
}

// Søk i organisasjonen og legg til som deltaker (i deltakerfanen)
export function LeggTilFraOrg({ deltakere }: { deltakere: Deltaker[] }) {
  const personer = usePersoner()
  const [tekst, setTekst] = useState('')
  const org = useOrgSok(personer?.katalog, tekst)
  if (!personer) return null
  const koblet = new Set(deltakere.map((d) => d.epost?.toLowerCase()).filter(Boolean))
  return (
    <div className="leggtil-org">
      <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Søk etter navn eller e-post i organisasjonen" />
      {org.laster && <span className="liten">Søker…</span>}
      {org.feil && (
        <div className="banner feil">
          {org.feil}{' '}
          {org.samtykke && (
            <button className="lenkeknapp" onClick={org.samtykke}>
              Gi samtykke
            </button>
          )}
        </div>
      )}
      {org.treff.length > 0 && (
        <ul className="liste">
          {org.treff.map((p) => (
            <li key={p.epost || p.navn}>
              <span>
                <b>{p.navn}</b> <span className="liten">{[p.stilling, p.epost].filter(Boolean).join(' · ')}</span>
              </span>
              {koblet.has(p.epost.toLowerCase()) ? (
                <span className="liten">Er deltaker</span>
              ) : (
                <button className="knapp liten" onClick={() => personer.leggTil(p)}>
                  Legg til
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!org.laster && !org.feil && tekst.trim().length >= 2 && org.treff.length === 0 && <p className="liten">Fant ingen i organisasjonen.</p>}
    </div>
  )
}

export interface Kobling {
  deltaker: Deltaker
  person: Person | null
  flere: boolean
}

// Prøver å finne deltakerne i organisasjonen ut fra navnet
export async function finnKoblinger(katalog: Katalog, deltakere: Deltaker[]): Promise<Kobling[]> {
  const ut: Kobling[] = []
  for (const d of deltakere) {
    if (!d.navn.trim() || d.epost) continue
    try {
      const { person, flere } = await finnPerson(katalog, d.navn)
      ut.push({ deltaker: d, person, flere })
    } catch (e) {
      if (e instanceof TrengerSamtykke) throw e
      ut.push({ deltaker: d, person: null, flere: false })
    }
  }
  return ut
}

// Melding når søket i organisasjonen feilet, med knapp for å gi samtykke og prøve igjen
export function SokFeil({ feil, katalog, igjen }: { feil: unknown; katalog: Katalog; igjen: () => void }) {
  return (
    <div className="banner feil">
      {feil instanceof Error ? feil.message : String(feil)}{' '}
      {feil instanceof TrengerSamtykke && katalog.samtykke && (
        <button className="lenkeknapp" onClick={() => void katalog.samtykke!().then(igjen, () => {})}>
          Gi samtykke og prøv igjen
        </button>
      )}
    </div>
  )
}

// Viser hvilke deltakere som ble funnet i organisasjonen, og lar brukeren velge hvilke som skal kobles
export function KoblingListe({ koblinger, valgt, setValgt }: { koblinger: Kobling[]; valgt: Set<string>; setValgt: (s: Set<string>) => void }) {
  const funnet = koblinger.filter((k) => k.person)
  const ikke = koblinger.filter((k) => !k.person)
  return (
    <div className="koblinger">
      {funnet.length > 0 && (
        <ul className="liste">
          {funnet.map((k) => (
            <li key={k.deltaker.id}>
              <label className="avkrysning">
                <input
                  type="checkbox"
                  checked={valgt.has(k.deltaker.id)}
                  onChange={(e) => {
                    const s = new Set(valgt)
                    if (e.target.checked) s.add(k.deltaker.id)
                    else s.delete(k.deltaker.id)
                    setValgt(s)
                  }}
                />
                <span>
                  {k.deltaker.navn} <span className="liten">→ {[k.person!.stilling, k.person!.epost].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {ikke.length > 0 && (
        <p className="liten">
          Ikke funnet: {ikke.map((k) => k.deltaker.navn + (k.flere ? ' (flere med samme navn)' : '')).join(', ')}. De beholdes som deltakere uten kobling, og kan kobles senere ved å søke dem opp.
        </p>
      )}
    </div>
  )
}
