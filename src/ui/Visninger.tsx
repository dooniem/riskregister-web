import { useEffect, useMemo, useState } from 'react'
import type { LagretVisning, Register } from '../model'
import { uid } from '../model'
import type { Op } from '../ops'
import type { Visning, VisningInnhold } from '../view'
import { beskrivVisning, brukVisning, eierNavn, likVisning, STANDARD_VISNING, visningInnhold } from '../view'
import { Felles, Pluss } from './Ikoner'
import { Modal, ModalTittel } from './Modal'

// Lagrede visninger: filter, sortering, gruppering og kolonner med et navn, som knapper over registeret.
// Felles visninger ligger i innstillingslisten og vises for alle i registeret. Personlige ligger i nettleseren, per register.

const personligKey = (registerId: string) => `rr-visninger:${registerId}`

function lesPersonlige(registerId: string): LagretVisning[] {
  try {
    const l = JSON.parse(localStorage.getItem(personligKey(registerId)) || '[]')
    return Array.isArray(l) ? l : []
  } catch {
    return []
  }
}

function lagrePersonlige(registerId: string, l: LagretVisning[]) {
  try {
    localStorage.setItem(personligKey(registerId), JSON.stringify(l))
  } catch {
    /* ignorer */
  }
}

// Navnet brukeren har i registeret (som risiko- eller tiltakseier), så «Bare mine» kan lagres som «den som bruker visningen»
export function megI(doc: Register, brukernavn: string): string | undefined {
  const b = brukernavn.trim().toLowerCase()
  return eierNavn(doc).find((n) => n.toLowerCase() === b) ?? (brukernavn.trim() || undefined)
}

interface Props {
  doc: Register
  visning: Visning
  setVisning: (f: (v: Visning) => Visning) => void
  brukernavn: string
  kanLagreFelles: boolean // kan skrive, ikke låst og ikke et snapshot
  endre: (...ops: Op[]) => void
  melding: (tekst: string) => void
  snarveiFra?: string
}

type Lagret = LagretVisning & { felles: boolean }

export function VisningKnapper({ doc, visning, setVisning, brukernavn, kanLagreFelles, endre, melding, snarveiFra }: Props) {
  const [personlige, setPersonlige] = useState(() => lesPersonlige(doc.registerId))
  useEffect(() => setPersonlige(lesPersonlige(doc.registerId)), [doc.registerId])
  const settPersonlige = (f: (l: LagretVisning[]) => LagretVisning[]) =>
    setPersonlige((l) => {
      const ny = f(l)
      lagrePersonlige(doc.registerId, ny)
      return ny
    })
  // Felles først, så de er på samme plass for alle
  const alle: Lagret[] = useMemo(() => [...(doc.visninger ?? []).map((v) => ({ ...v, felles: true })), ...personlige.map((v) => ({ ...v, felles: false }))], [doc.visninger, personlige])
  const meg = megI(doc, brukernavn)
  const [aktivId, setAktivId] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const aktiv = alle.find((v) => v.id === aktivId)
  const endret = !!aktiv && !likVisning(visning, aktiv.innhold, meg)

  const velg = (v: Lagret) => {
    if (likVisning(visning, v.innhold, meg)) {
      // Klikk på visningen som vises, går tilbake til standard, som snarveiene
      setAktivId(null)
      setVisning((x) => brukVisning(x, visningInnhold({ ...STANDARD_VISNING, fane: 'aapne' }), meg))
      return
    }
    setAktivId(v.id)
    setVisning((x) => brukVisning(x, v.innhold, meg, snarveiFra))
  }

  const lagre = (navn: string, felles: boolean, erstatt?: Lagret) => {
    const ny: LagretVisning = {
      id: erstatt?.id ?? uid(),
      navn,
      innhold: visningInnhold(visning, meg),
      av: brukernavn || undefined,
      endret: new Date().toISOString(),
    }
    if (felles) {
      const { felles: _f, ...fra } = erstatt ?? ({} as Lagret)
      endre({
        t: 'setFellesVisning',
        id: ny.id,
        visning: ny,
        fra: erstatt ? fra : null,
      })
    } else settPersonlige((l) => (erstatt ? l.map((x) => (x.id === ny.id ? ny : x)) : [...l, ny]))
    setAktivId(ny.id)
    melding(erstatt ? `Visningen «${navn}» er oppdatert.` : `Visningen «${navn}» er lagret${felles ? ' for alle i registeret' : ''}.`)
  }

  const slett = (v: Lagret) => {
    if (v.felles) {
      const { felles: _f, ...fra } = v
      endre({ t: 'setFellesVisning', id: v.id, visning: null, fra })
    } else settPersonlige((l) => l.filter((x) => x.id !== v.id))
    if (aktivId === v.id) setAktivId(null)
    melding(`Visningen «${v.navn}» er slettet.`)
  }

  const kanEndre = (v: Lagret) => !v.felles || kanLagreFelles

  return (
    <>
      <span className="snarvei-etikett">Visninger</span>
      {alle.map((v) => {
        const valgt = likVisning(visning, v.innhold, meg)
        return (
          <button
            key={v.id}
            className={'snarvei visning-knapp' + (valgt ? ' valgt' : '') + (v.id === aktivId && endret ? ' endret' : '')}
            aria-pressed={valgt}
            title={
              (v.felles ? `Felles visning${v.av ? `, lagret av ${v.av}` : ''}` : 'Personlig visning, bare du ser den') +
              ':\n' +
              beskrivVisning(doc, v.innhold).join('\n') +
              (valgt ? '\n\nKlikk igjen for å gå tilbake til standard.' : '')
            }
            onClick={() => velg(v)}
          >
            {v.felles && <Felles str={13} />}
            {v.navn}
            {v.id === aktivId && endret && <span className="endret-prikk" aria-label="(endret)" />}
          </button>
        )
      })}
      {aktiv && endret && kanEndre(aktiv) && (
        <button className="lenkeknapp visning-oppdater" onClick={() => lagre(aktiv.navn, aktiv.felles, aktiv)} title={`Lagre det som vises nå i «${aktiv.navn}»`}>
          Lagre endringene
        </button>
      )}
      <button className="snarvei ny-visning" onClick={() => setDialog(true)} title="Lagre filter, sortering, gruppering og kolonner som vises nå, eller slett lagrede visninger">
        <Pluss str={12} /> Lagre visning
      </button>
      {dialog && (
        <VisningDialog doc={doc} innhold={visningInnhold(visning, meg)} alle={alle} kanLagreFelles={kanLagreFelles} lagre={lagre} slett={slett} kanEndre={kanEndre} lukk={() => setDialog(false)} />
      )}
    </>
  )
}

function VisningDialog({
  doc,
  innhold,
  alle,
  kanLagreFelles,
  lagre,
  slett,
  kanEndre,
  lukk,
}: {
  doc: Register
  innhold: VisningInnhold
  alle: Lagret[]
  kanLagreFelles: boolean
  lagre: (navn: string, felles: boolean, erstatt?: Lagret) => void
  slett: (v: Lagret) => void
  kanEndre: (v: Lagret) => boolean
  lukk: () => void
}) {
  const [navn, setNavn] = useState('')
  const [felles, setFelles] = useState(false)
  const [feil, setFeil] = useState('')
  const [slettes, setSlettes] = useState<string | null>(null)
  const n = navn.trim()
  const finnes = alle.find((v) => v.felles === felles && v.navn.toLowerCase() === n.toLowerCase())
  const beskrivelse = beskrivVisning(doc, innhold)
  const send = (e: React.FormEvent) => {
    e.preventDefault()
    if (!n) return setFeil('Gi visningen et navn, for eksempel «Riskgjennomgang».')
    if (finnes && !kanEndre(finnes)) return setFeil(`«${finnes.navn}» er en felles visning, og registeret kan ikke endres nå.`)
    lagre(n, felles, finnes)
    lukk()
  }
  return (
    <Modal className="visning-dialog" lukk={lukk}>
      <header>
        <ModalTittel>Lagre visning</ModalTittel>
        <button className="ikonknapp" onClick={lukk} aria-label="Lukk" title="Lukk">
          ✕
        </button>
      </header>
      <form className="modal-innhold skjema" onSubmit={send}>
        <label className="felt">
          <span>Navn</span>
          <input autoFocus value={navn} maxLength={40} onChange={(e) => (setNavn(e.target.value), setFeil(''))} placeholder="F.eks. Riskgjennomgang" />
        </label>
        <div className="felt">
          <span>Hvem ser den</span>
          <div className="segment" role="radiogroup" aria-label="Hvem ser visningen">
            <button type="button" role="radio" aria-checked={!felles} className={!felles ? 'valgt' : ''} onClick={() => setFelles(false)}>
              Bare meg
            </button>
            <button type="button" role="radio" aria-checked={felles} className={felles ? 'valgt' : ''} disabled={!kanLagreFelles} onClick={() => setFelles(true)}>
              Alle i registeret
            </button>
          </div>
          <small>
            {!kanLagreFelles
              ? 'Felles visninger kan bare lagres når du kan redigere registeret.'
              : felles
                ? 'Visningen vises som en knapp over registeret for alle som åpner det.'
                : 'Visningen lagres i denne nettleseren og vises bare for deg.'}
          </small>
        </div>
        <div className="visning-innhold">
          <div className="liten">Visningen husker</div>
          <ul>
            {beskrivelse.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <div className="liten">Søket, kolonnebreddene og oversikten lagres ikke.</div>
        </div>
        {finnes && kanEndre(finnes) && (
          <div className="banner advarsel">
            Det finnes allerede en {felles ? 'felles' : 'personlig'} visning som heter «{finnes.navn}». Den blir erstattet.
          </div>
        )}
        {feil && <div className="banner feil">{feil}</div>}
        <div className="knapperad">
          <button type="button" className="knapp" onClick={lukk}>
            Avbryt
          </button>
          <button type="submit" className="knapp primær">
            {finnes && kanEndre(finnes) ? 'Erstatt visningen' : 'Lagre visningen'}
          </button>
        </div>
        {alle.length > 0 && (
          <div className="visning-liste">
            <h3>Lagrede visninger</h3>
            {alle.map((v) => (
              <div key={v.id} className="visning-rad">
                <span className="visning-navn">
                  {v.felles && <Felles str={13} />} {v.navn}
                </span>
                <span className="liten">{v.felles ? `Felles${v.av ? `, ${v.av}` : ''}` : 'Bare meg'}</span>
                {kanEndre(v) &&
                  (slettes === v.id ? (
                    <span className="visning-slett">
                      <button type="button" className="knapp liten fare" onClick={() => (slett(v), setSlettes(null))}>
                        Slett «{v.navn}»
                      </button>
                      <button type="button" className="knapp liten" onClick={() => setSlettes(null)}>
                        Avbryt
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="lenkeknapp" onClick={() => setSlettes(v.id)} title={v.felles ? 'Sletter visningen for alle i registeret' : 'Sletter visningen'}>
                      Slett
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  )
}
