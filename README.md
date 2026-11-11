# Riskregister web

Web-versjon av Riskregister (tidligere `Riskregister beta26 2.1.0.xlsm`). Flere kan jobbe i samme register samtidig, og tilgangen styres av SharePoint.

## Slik fungerer det

- Hvert prosjekt har ett riskregister på sitt eget SharePoint-område, lagret i SharePoint-lister (risker, tiltak, innstillinger, snapshots). Det finnes ingen sentral database. Listene og kolonnene er beskrevet i [docs/IT-oppsett.md](docs/IT-oppsett.md).
- Appen er en statisk nettside uten egen server. Den leser og skriver listene via Microsoft Graph med brukerens egen innlogging (delegerte tillatelser), så brukeren får bare åpnet registre på områder de har tilgang til.
- Hver risk og hvert tiltak er en egen rad. Bare endrede rader lagres, med radens etag (`If-Match`). Har noen andre endret samme rad i mellomtiden, hentes ny versjon og endringene legges oppå. To personer som endrer ulike risker, kommer aldri i konflikt.
- Når du redigerer en celle, låses risken for andre til du er ferdig. Andre ser hvem som står hvor, og hvem som skriver.
- Snapshots tas manuelt og kan sammenlignes med registeret slik det er nå: endringer i tallene vises i tabellen og oversikten, og piler i den store risikomatrisen viser hvordan riskene har flyttet seg.

## Moduser

| Modus | Adresse | Krever |
| --- | --- | --- |
| Demo | `?demo=<navn>` | Ingenting. Lagres i liksomlister i nettleseren, flere faner = flere brukere |
| SharePoint | `?site=<adressen til området>` | Appregistrering i Entra ID (se [docs/IT-oppsett.md](docs/IT-oppsett.md), eller [docs/Testmiljo.md](docs/Testmiljo.md) for en egen test-tenant) |

Legg til `&snapshot=<id>` for å åpne et snapshot skrivebeskyttet.

## Utvikling

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # statiske filer i dist/
```

Tilkobling til Entra ID settes på én av disse måtene (første som finnes brukes):

1. Tilkoblingsinnstillinger på startsiden (lagres i nettleseren, for testing)
2. Miljøvariablene `VITE_AZURE_CLIENT_ID` og `VITE_AZURE_TENANT_ID` ved bygging
3. `config.json` ved siden av `index.html`

## Kode

Tabellene viser de viktigste filene, ikke alle.

**Datamodell og logikk**

| Fil | Innhold |
| --- | --- |
| `src/model.ts` | Datamodell, beregninger (eksponering, FV), farger fra VBA-koden og faselisten |
| `src/columns.ts` | Kolonnene i tabellen, kolonnegruppene og formatering av tall og datoer |
| `src/view.ts` | Visning: faner, filtrering, sortering og gruppering. Endrer aldri selve registeret |
| `src/ops.ts` | Endringsoperasjoner og hvordan de legges oppå siste versjon |
| `src/sync.ts` | Lagring, henting, tilstedeværelse, redigeringslåser og låsen på hele registeret |
| `src/sammenlign.ts` | Sammenligning av registeret med et snapshot |
| `src/historikk.ts` | Versjonshistorikken til en risk som en liste over endringer |
| `src/hvile.ts` | Hjelpefunksjoner for å la risker hvile til en dato eller en fase |
| `src/excel.ts` | Import fra XLSM og eksport til Excel med farger |
| `src/kryptert.ts` | Åpner Excel-filer som er låst med passord |
| `src/versjoner.ts` | Versjonslisten som vises i Om-vinduet |
| `src/profil/` | Bedriftsprofil (farger, skrift og logo), slås på med `?profil=yes` |
| `src/eksempel.ts`, `src/sim.ts` | Eksempelregister og simulert kollega for demomodus |

**Lagring**

| Fil | Innhold |
| --- | --- |
| `src/store/auth.ts` | Microsoft-innlogging (MSAL), tilkoblingsinnstillinger og hvilken Graph-tillatelse appen ber om |
| `src/store/graph.ts` | Kall mot Microsoft Graph og feilmeldinger |
| `src/store/backend.ts` | Felles grensesnitt for lagring av registeret og snapshots |
| `src/store/listeBackend.ts` | Registeret i lister: lagring av endrede rader, tilstedeværelse og snapshots |
| `src/store/lister/skjema.ts` | Listene og kolonnene i SharePoint, og koblingen til datamodellen |
| `src/store/lister/lager.ts` | Felles grensesnitt for SharePoint-lister og liksomlister |
| `src/store/lister/graphLister.ts` | SharePoint-lister via Microsoft Graph |
| `src/store/lister/demoLister.ts` | Liksomlister i nettleseren for demomodus |
| `src/store/lister/feilsok.ts` | Feilsøk-rapporten når SharePoint avviser lagringen |
| `src/store/demoBackend.ts` | Demoregistre i nettleseren |
| `src/store/filer.ts`, `src/store/graphFiler.ts` | Mapper og filer i dokumentbiblioteket, for import, eksport og vedlegg |
| `src/store/katalog.ts` | Søk etter personer i organisasjonen |

**Brukergrensesnitt**

| Fil | Innhold |
| --- | --- |
| `src/App.tsx` | Innlogging, adresseparametre og valg mellom startsiden og registeret |
| `src/ui/Start.tsx` | Startsiden: åpne, opprette og importere registre |
| `src/ui/RegisterView.tsx` | Selve registeret: verktøylinje, menyer, faner, banner og dialogene |
| `src/ui/Grid.tsx` | Excel-lik tabell, brukes i alle tre utseendene |
| `src/ui/Kortliste.tsx` | Riskene som kort på mobil |
| `src/ui/Detaljpanel.tsx` | Panelet med alle feltene og tiltakene til én risk |
| `src/ui/KostEditor.tsx` | Redigering av BC, ML og WC samlet, i Moderne og Samlet |
| `src/ui/VurderingEditor.tsx` | Redigering av sannsynlighet og konsekvens, i Moderne og Samlet |
| `src/ui/Oversikt.tsx` | Oversikten ved siden av tabellen: nøkkeltall og risikomatriser |
| `src/ui/Risikobilde.tsx` | Siden Risikobilde i Moderne og Samlet: stor matrise, forventet kost og største endringer siden et snapshot |
| `src/ui/StorMatrise.tsx` | Den store risikomatrisen, med piler mot et snapshot |
| `src/ui/Skarisk.tsx` | Fanen Til Skarisk |
| `src/ui/Visninger.tsx` | Lagrede visninger, felles og personlige |
| `src/ui/Snapshots.tsx` | Snapshot-vinduet: ta, åpne og sammenligne snapshots |
| `src/ui/Prosjektpanel.tsx` | Prosjekt og deltakere: prosjektinfo, deltakere, gjennomganger og lister og valg |
| `src/ui/ByttFase.tsx`, `src/ui/Hvile.tsx` | Bytt fase og Hvil |
| `src/ui/LaasDialog.tsx` | Lås riskregister, og vinduet med endringer gjort mens registeret var låst |
| `src/ui/Vedlegg.tsx` | Vedlegg til risker |
| `src/ui/ImportDialog.tsx` | Legger risker fra en Excel-fil (f.eks. et delregister) til i registeret |
