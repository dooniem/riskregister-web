import { GJELDENDE, VERSJONER } from '../versjoner'
import { Modal, ModalTittel } from './Modal'

const dato = (iso: string) => new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })

// «Om»-vinduet nederst i Mer-menyen: hva appen er, hvor dataene ligger, og noen tips for vanlige brukere.
export function OmDialog({ demo, lukk }: { demo: boolean; lukk: () => void }) {
  return (
    <Modal className="om" lukk={lukk}>
      <header>
        <ModalTittel>Om Riskregister</ModalTittel>
        <button className="ikonknapp" onClick={lukk} aria-label="Lukk" title="Lukk">
          ✕
        </button>
      </header>
      <div className="modal-innhold">
        <p>
          Riskregister er en nettside som jobber direkte mot prosjektets SharePoint-område. Riskene, tiltakene og
          innstillingene ligger i lister på området, ikke hos oss. Appen har ingen egen server eller database, og du
          logger inn med din vanlige jobbkonto.
        </p>
        {demo && (
          <p className="om-merk">
            Du er i demomodus. Her lagres alt bare i denne nettleseren, og ingenting sendes til SharePoint.
          </p>
        )}

        <h3>Nytt i versjon {GJELDENDE.versjon}</h3>
        <VersjonInnhold v={GJELDENDE} />
        {VERSJONER.length > 1 && (
          <details className="om-tidligere">
            <summary>Tidligere versjoner</summary>
            {VERSJONER.slice(1).map((v) => (
              <section key={v.versjon}>
                <h4>
                  Versjon {v.versjon} <span>{dato(v.dato)}</span>
                </h4>
                <VersjonInnhold v={v} />
              </section>
            ))}
          </details>
        )}

        <h3>Hvem har tilgang</h3>
        <p>
          De som har tilgang til SharePoint-området, har tilgang til registeret. Har du bare lesetilgang til området,
          kan du se registeret, men ikke endre det. Tilgang gis av den som eier området.
        </p>

        <h3>Lagring</h3>
        <p>
          Alt du endrer lagres med en gang, så det finnes ingen lagre-knapp. Øverst til høyre ser du om endringene er
          lagret. Mister du nettet, prøver appen igjen til endringene er lagret.
        </p>

        <h3>Flere samtidig</h3>
        <p>
          Flere kan jobbe i registeret samtidig og ser hverandres endringer fortløpende. Initialene øverst viser hvem
          som er inne. Mens du redigerer en risk, er den låst for andre til du er ferdig.
        </p>

        <h3>Nyttig å vite</h3>
        <ul>
          <li>Høyreklikk på en risk (langt trykk på mobil) for å se hvem som opprettet og sist endret den.</li>
          <li>
            Ta et snapshot før et møte eller en milepæl. Da kan du senere se hva som er endret siden, både i
            tabellen og i risikobildet.
          </li>
          <li>Registeret kan eksporteres til Excel og skrives ut eller lagres som PDF fra Mer-menyen.</li>
        </ul>
      </div>
      <footer className="om-fot">
        Riskregister {GJELDENDE.versjon} · {dato(GJELDENDE.dato)} · Laget av Magnus Petersen
      </footer>
    </Modal>
  )
}

function VersjonInnhold({ v }: { v: (typeof VERSJONER)[number] }) {
  return (
    <>
      {v.oppsummering && <p>{v.oppsummering}</p>}
      {v.nytt && v.nytt.length > 0 && (
        <ul>
          {v.nytt.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
  )
}
