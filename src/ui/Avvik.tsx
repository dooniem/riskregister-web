import { useState } from 'react'
import { nyRisk } from '../model'
import { loggInn } from '../store/auth'
import { ListeBackend } from '../store/listeBackend'
import type { Okt, Snapshot } from '../sync'

const INNSTILLING_NAVN: Record<string, string> = {
  registerId: 'registerets id',
  opprettet: 'opprettet',
  prosjekt: 'prosjektinformasjon',
  deltakere: 'deltakere',
  gjennomganger: 'gjennomganger',
  lister: 'nedtrekkslister',
  nesteNr: 'neste risknummer',
  excelNokkel: 'Excel-kobling',
}

// Knapp som kjører en handling mot SharePoint og viser feilen hvis den feiler
function Handling({ tekst, onKlikk, primaer, bekreft, oppdater }: { tekst: string; onKlikk: () => Promise<unknown> | void; primaer?: boolean; bekreft?: string; oppdater?: () => void }) {
  const [jobber, setJobber] = useState(false)
  const [feil, setFeil] = useState('')
  return (
    <>
      <button
        className={'knapp' + (primaer ? ' primær' : '')}
        disabled={jobber}
        onClick={() => {
          if (bekreft && !confirm(bekreft)) return
          setJobber(true)
          setFeil('')
          Promise.resolve(onKlikk())
            .catch((e) => setFeil(e instanceof Error ? e.message : String(e)))
            .finally(() => {
              setJobber(false)
              oppdater?.()
            })
        }}
      >
        {tekst}
      </button>
      {feil && <span className="feiltekst">{feil}</span>}
    </>
  )
}

// Endringer som ikke er lagret: synlig når lagringen feiler, og når en tidligere økt etterlot endringer i nettleseren
export function UlagretBanner({ okt, snap }: { okt: Okt; snap: Snapshot }) {
  const b = okt.backend
  const problem = snap.ventende > 0 && (snap.status === 'frakoblet' || snap.status === 'feil' || !b.kanSkrive)
  const innlogging = /innlogg|login|interaction/i.test(snap.feil ?? '')
  return (
    <>
      {snap.ulagret && b.kanSkrive && (
        <div className="banner advarsel">
          <span>
            Du har {snap.ulagret.antall === 1 ? 'én endring' : `${snap.ulagret.antall} endringer`} fra {new Date(snap.ulagret.tid).toLocaleString('nb-NO')} som ikke ble lagret, f.eks.
            fordi fanen ble lukket eller innloggingen måtte fornyes. Endringer andre har gjort i mellomtiden, beholdes.
          </span>
          <button className="knapp primær" onClick={() => okt.gjenopprettUlagret()}>
            Lagre dem nå
          </button>
          <button className="knapp" onClick={() => confirm('Forkaste endringene? De kan ikke hentes tilbake.') && okt.forkastUlagret()}>
            Forkast
          </button>
        </div>
      )}
      {problem && (
        <div className="banner feil avvik">
          <span>
            {!b.kanSkrive ? (
              <>
                Du har ikke lenger skrivetilgang til registeret, så {snap.ventende === 1 ? 'én endring' : `${snap.ventende} endringer`} kan ikke lagres. De er tatt vare på i
                denne nettleseren, og du får spørsmål om å lagre dem neste gang du åpner registeret med skrivetilgang.
              </>
            ) : (
              <>
                {snap.ventende === 1 ? 'Én endring' : `${snap.ventende} endringer`} er ikke lagret ennå{snap.feil ? `: ${snap.feil}` : '.'} De er tatt vare på i denne nettleseren og
                lagres så snart det går.
              </>
            )}
          </span>
          {innlogging && b.type === 'sharepoint' && (
            <button className="knapp" onClick={() => void loggInn()}>
              Logg inn på nytt
            </button>
          )}
        </div>
      )}
    </>
  )
}

// Det som ser feil ut i listene etter redigering direkte i SharePoint, med valg for hva som skal skje
export function AvvikBanner({ okt }: { okt: Okt }) {
  const b = okt.backend
  if (!(b instanceof ListeBackend)) return null
  const { innstillinger, doble } = b.avvik
  // Risker som er gjenopprettet i appen, men ikke hentet på nytt ennå
  const forelderlose = b.avvik.forelderlose.filter((f) => !okt.doc.risker.some((r) => r.id === f.riskId))
  if (!innstillinger.length && !doble.length && !forelderlose.length) return null
  const skrive = b.kanSkrive
  const papirkurv = b.type === 'sharepoint' ? ' Rader som er slettet i SharePoint, ligger i papirkurven på området i 93 dager og kan gjenopprettes derfra med alt innhold.' : ''
  return (
    <div className="banner advarsel avvik">
      {innstillinger.length > 0 && (
        <div className="avvik-linje">
          <span>
            Innstillingene for {innstillinger.map((k) => INNSTILLING_NAVN[k] ?? k).join(', ')} i listen «Riskregister Klientinnstillinger» kan ikke leses, trolig etter redigering i
            SharePoint. Appen viser standardverdien og skriver ikke over raden. Rett raden i SharePoint (versjonsloggen viser tidligere verdier), eller bruk standardverdien.
          </span>
          {skrive && (
            <Handling
              oppdater={() => okt.oppdater()}
              tekst="Bruk standardverdien"
              bekreft="Raden overskrives med standardverdien. Den gamle verdien finnes i versjonsloggen til raden i SharePoint."
              onKlikk={() => b.overskrivInnstillinger(okt.doc)}
            />
          )}
        </div>
      )}
      {doble.map((d) => (
        <div className="avvik-linje" key={'d' + d.riskId}>
          <span>
            Risk {d.nr}
            {d.tittel && ` «${d.tittel.slice(0, 60)}»`} finnes {d.kopier.length + 1} ganger i listen, trolig kopiert i SharePoint. Appen viser og endrer den eldste raden.
          </span>
          {skrive && (
            <>
              <Handling
              oppdater={() => okt.oppdater()}
                tekst={d.kopier.length > 1 ? 'Gjør kopiene til egne risker' : 'Gjør kopien til egen risk'}
                onKlikk={async () => {
                  await b.slettKopier(d.riskId)
                  okt.utfor(...d.kopier.map((k) => ({ t: 'addRisk' as const, risk: { ...k.risk, id: nyRisk(0).id, tiltak: [] } })))
                }}
              />
              <Handling oppdater={() => okt.oppdater()} tekst={d.kopier.length > 1 ? 'Slett kopiene' : 'Slett kopien'} bekreft="Kopiene slettes fra listen i SharePoint (de havner i papirkurven)." onKlikk={() => b.slettKopier(d.riskId)} />
            </>
          )}
        </div>
      ))}
      {forelderlose.map((f) => (
        <div className="avvik-linje" key={'f' + f.riskId}>
          <span>
            {f.tiltak.length === 1 ? 'Ett tiltak' : `${f.tiltak.length} tiltak`} ({f.tiltak.map((t) => `«${(t.tekst || 'uten tekst').slice(0, 40)}»`).join(', ')}) hører til en risk som er
            slettet fra listen.{papirkurv} Du kan også lage risken på nytt (årsak, hendelse og vurdering må fylles inn igjen), eller slette tiltakene.
          </span>
          {skrive && (
            <>
              <Handling oppdater={() => okt.oppdater()} tekst="Gjenopprett risken" onKlikk={() => okt.utfor({ t: 'addRisk', risk: { ...nyRisk(0), id: f.riskId, hendelse: 'Gjenopprettet risk', tiltak: f.tiltak } })} />
              <Handling
              oppdater={() => okt.oppdater()}
                tekst={f.tiltak.length === 1 ? 'Slett tiltaket' : 'Slett tiltakene'}
                bekreft="Tiltakene slettes fra listen i SharePoint (de havner i papirkurven)."
                onKlikk={() => b.slettForelderlose(f.riskId)}
              />
            </>
          )}
        </div>
      ))}
    </div>
  )
}
