# Oppsett hos IT

Appen trenger én appregistrering i Entra ID. Den har ingen egen server, database eller hemmeligheter. Hvert prosjekt har sitt riskregister på sitt eget SharePoint-område, lagret i SharePoint-lister.

For å teste i en egen tenant uten IT, se [Testmiljo.md](Testmiljo.md).

## Appregistrering

1. Entra ID › App registrations › New registration
   - Navn: `Riskregister`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI: plattform **Single-page application (SPA)**, adresse = der appen ligger, f.eks. `https://riskregister.firma.no/` (eksakt, med avsluttende `/`)
2. API permissions › Add › Microsoft Graph › **Delegated**:
   - `Sites.Manage.All` – lese og skrive listene på områder brukeren selv har tilgang til, og lage listene for et nytt register på områder brukeren eier
   - `User.Read` – navnet på brukeren
   - `User.ReadBasic.All` – søk etter personer i organisasjonen (navn, e-post og stilling), så risikoeiere, tiltakseiere og deltakere kan kobles til ekte brukere. Appen ber om denne først når noen søker, så innloggingen virker også uten den. Uten den kan deltakere bare skrives inn for hånd.
3. Grant admin consent (anbefalt, slik at brukerne ikke får samtykkedialog)
4. Send **Application (client) ID** og **Directory (tenant) ID** til den som drifter appen. Ingen client secret trengs.

Delegerte tillatelser betyr at appen aldri får tilgang til mer enn den innloggede brukeren har i SharePoint. Har en bruker bare lesetilgang til området, kan registeret leses men ikke endres. Har brukeren ingen tilgang, svarer Graph 403.

Trenger appen ikke å lage lister selv (fordi listene lages av IT eller med en områdemal), holder `Sites.ReadWrite.All`.

### Alternativ for pilot: Sites.Selected

I stedet kan appen få delegert `Sites.Selected`. Da når appen bare de SharePoint-områdene IT eksplisitt gir den tilgang til, og fortsatt bare det den innloggede brukeren selv har tilgang til der.

1. API permissions › Microsoft Graph › **Delegated** › `Sites.Selected` (og `User.Read` og `User.ReadBasic.All`), og grant admin consent.
2. Gi appen tilgang til hvert pilotområde, f.eks. med Graph: `POST /sites/{site-id}/permissions` med `{"roles": ["manage"], "grantedToIdentities": [{"application": {"id": "<client id>", "displayName": "Riskregister"}}]}`, eller PowerShell `Grant-PnPAzureADAppSitePermission -AppId <client id> -DisplayName Riskregister -Site <område-url> -Permissions Manage`. Rollen `write` holder når listene allerede finnes.
3. I appen velges **Sites.Selected** under Tilkoblingsinnstillinger på startsiden (eller repo-variabelen `AZURE_TILLATELSE=sites` ved bygg).

Søk etter områder på startsiden virker ikke med Sites.Selected. Brukerne limer inn adressen til området.

## Tilkobling i appen

Klient-ID og tenant-ID leses fra (første som finnes brukes):

1. Tilkoblingsinnstillinger på startsiden (lagres bare i nettleseren, for testing)
2. Miljøvariablene `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID` og `VITE_AZURE_TILLATELSE` ved bygging (i GitHub: repo-variablene `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_TILLATELSE`)
3. `config.json` ved siden av `index.html`

Startsiden viser hvilken tenant appen er koblet til og hvor innstillingen kom fra.

## Hosting

Statiske filer (`dist/`). Alternativer:

- Azure Static Web Apps (gratisnivå holder)
- GitHub Pages fra dette repoet (brukes under utvikling)
- Senere: SharePoint Framework-webdel, så appen ligger inne på prosjektsiden

## Listene på hvert område

Når et register settes opp, lager appen disse listene på området (vanlige egendefinerte lister). Kolonnene er tekst, tall og ja/nei, slik at de er lette å lese i SharePoint og å hente ut til et datavarehus. Datoer lagres som tekst (`ÅÅÅÅ-MM-DD` eller ISO-tid).

| Liste | Innhold |
| --- | --- |
| Riskregister Risker | Én rad per risk: `RiskId` (indeksert), `Nr`, `RM`, `Aarsak`, `Hendelse`, `Konsekvenser`, `Eier`, `Status`, `Kategori`, `Egendef`, `Egendef2`, `FagId`, `Sannsynlighet`, `Konsekvens`, `BC`, `ML`, `WC`, `TilSkarisk`, `Kilde`, `EndretTid`, `EndretAv`, `OpprettetTid`, `OpprettetAv`, `LukketTid`, `LukketAv` |
| Riskregister Tiltak | Én rad per tiltak: `RiskId` (indeksert, peker på risken), `TiltakId`, `Rekkefolge`, `Tekst`, `Eier`, `Frist`, `Beskrivelse`, `Status` |
| Riskregister Innstillinger | Én rad per nøkkel (`Title`), verdien som JSON i `Verdi`: `prosjekt`, `deltakere` (med e-post når deltakeren er koblet til en bruker), `gjennomganger`, `lister` (nedtrekkslister og fag), `nesteNr`, `registerId`, `opprettet`, `excelNokkel` |
| Riskregister Tilstede | Hvem som har registeret åpent, og hvilken risk de redigerer. Én rad per åpen økt, slettes når brukeren lukker |
| Riskregister Snapshots | Én rad per snapshot: `SnapshotId` (indeksert), `Tidspunkt`, `TattAv`, `AntallRisker`, `Kommentar`, `Register` (prosjektinfo og lister som JSON) |
| Riskregister Snapshotdata | Riskene slik de var da snapshotet ble tatt: `SnapshotId` (indeksert) og de samme kolonnene som i Risker, pluss `Tiltak` (JSON) |

`Title` er hendelsen for risker og teksten for tiltak, så listene er lesbare i SharePoint. Hele koblingen mellom appen og kolonnene ligger i `src/store/lister/skjema.ts`, slik at den kan tilpasses et annet listeoppsett.

Listene kan gjerne skjules fra navigasjonen. Brukerne trenger ikke å åpne dem direkte.

## Samtidig redigering

- Hver risk og hvert tiltak er en egen rad. Ved lagring skrives bare radene som er endret, med radens etag (`If-Match`). Har noen andre endret samme rad i mellomtiden, henter appen registeret på nytt og legger endringene oppå. To som endrer ulike risker, kommer aldri i konflikt.
- Mens en bruker redigerer en risk, er den låst for andre (via Tilstede-listen).
- Nye risker får nummer fra `nesteNr` i innstillingene, som skrives først. To som legger til en risk samtidig, får dermed ulike nummer.

## Belastning mot SharePoint

Per åpen bruker, omtrent:

| Kall | Hyppighet |
| --- | --- |
| Sjekk om listene er endret (`GET /sites/{id}/lists?$select=lastModifiedDateTime`) | hvert 3. sekund |
| Lese tilstedelisten | hvert 3. sekund |
| Skrive egen tilstederad | hvert 10. sekund og ved flytting |
| Hente registeret (alle rader i Risker, Tiltak og Innstillinger) | ved endringer, og minst hvert 30. sekund |
| Lagre endrede rader (`$batch`, opptil 20 rader per kall) | ved endring, samlet over 2 sekunder |

Appen respekterer `Retry-After` ved struping (429/503). Intervallene kan økes ved behov.

## Snapshots

Et snapshot tas manuelt i appen (Mer › Snapshots og sammenligning). Riskene kopieres til Snapshotdata, og snapshot-raden skrives til slutt, slik at et avbrutt snapshot aldri vises. Snapshotene kan sammenlignes med registeret slik det er nå: endringer i BC, ML, WC, FV og summene vises i tabellen og oversikten, og piler i risikomatrisen viser hvordan riskene har flyttet seg.

## Eksport til datavarehus

Listene kan leses direkte med Graph (`/sites/{id}/lists/{liste}/items?$expand=fields`) eller med SharePoint-koblingen i Power BI / Data Factory. `RiskId` og `SnapshotId` er stabile nøkler.
