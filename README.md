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

| Fil | Innhold |
| --- | --- |
| `src/model.ts` | Datamodell, beregninger (eksponering, FV) og farger fra VBA-koden |
| `src/ops.ts` | Endringsoperasjoner og hvordan de legges oppå siste versjon |
| `src/sync.ts` | Lagring, henting, tilstedeværelse og låsing |
| `src/store/lister/skjema.ts` | Listene og kolonnene i SharePoint, og koblingen til datamodellen |
| `src/store/listeBackend.ts` | Registeret i lister: lagring av endrede rader, tilstedeværelse og snapshots |
| `src/store/lister/graphLister.ts` | SharePoint-lister via Microsoft Graph |
| `src/store/lister/demoLister.ts` | Liksomlister i nettleseren for demomodus |
| `src/store/graphFiler.ts` | Dokumentbiblioteket på området, for import og eksport av Excel |
| `src/sammenlign.ts` | Sammenligning av registeret med et snapshot |
| `src/ui/Grid.tsx` | Excel-lik tabell |
| `src/ui/KostEditor.tsx` | Redigering av BC, ML og WC samlet, i moderne utseende |
| `src/ui/Risikobilde.tsx` | Siden Risikobilde i moderne utseende: stor matrise, forventet kost og største endringer siden et snapshot |
| `src/excel.ts` | Import fra XLSM og eksport til Excel |
