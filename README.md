# Riskregister web

Web-versjon av Riskregister (tidligere `Riskregister beta26 2.1.0.xlsm`). Flere kan jobbe i samme register samtidig, og tilgangen styres av SharePoint.

## Slik fungerer det

- Hvert prosjekt har en mappe i sitt eget SharePoint-område med `register.json`. Det finnes ingen sentral database.
- Appen er en statisk nettside uten egen server. Den leser og skriver registeret via Microsoft Graph med brukerens egen innlogging (delegerte tillatelser), så brukeren får bare åpnet registre de har tilgang til i SharePoint.
- Endringer lagres med en gang som små operasjoner. Hvis noen andre har lagret i mellomtiden (ETag/`If-Match`), hentes ny versjon og endringene legges oppå. To personer som endrer ulike risker overskriver aldri hverandre.
- Når du redigerer en celle, låses risken for andre til du er ferdig. Andre ser hvem som står hvor, og hvem som skriver.
- Tilstedeværelse og låser ligger som én liten fil per bruker i undermappen `_tilstede`, slik at ingen skriver til samme fil.

## Moduser

| Modus | Adresse | Krever |
| --- | --- | --- |
| Demo | `?demo=<navn>` | Ingenting. Lagres i nettleseren, flere faner = flere brukere |
| SharePoint | `?reg=<lenke til mappe>` eller `?reg=drive:<driveId>:<itemId>` | Appregistrering i Entra ID (se [docs/IT-oppsett.md](docs/IT-oppsett.md)) |

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
| `src/store/graphBackend.ts` | SharePoint via Microsoft Graph |
| `src/store/demoBackend.ts` | Demolagring i nettleseren |
| `src/ui/Grid.tsx` | Excel-lik tabell |
| `src/excel.ts` | Import fra XLSM og eksport til Excel |
