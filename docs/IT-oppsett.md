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

Appen er statiske filer (`dist/`) og kan ligge hvor som helst som serverer HTTPS:

| Alternativ | Passer for | Merk |
| --- | --- | --- |
| GitHub Pages (`https://dooniem.github.io/riskregister-web/`) | Utvikling og testing | Bygges og publiseres automatisk fra `main`. Ligger utenfor organisasjonens kontroll. |
| Azure Static Web Apps (gratisnivå holder) | Pilot og drift | Organisasjonen eier adressen og publiseringen. Kan få eget domene, f.eks. `https://riskregister.firma.no/`. |
| SharePoint Framework-webdel | Senere | Appen ligger inne på prosjektsiden. Krever ombygging. |

Adressen appen ligger på bestemmer tre ting, og alle tre må endres hvis appen flyttes:

1. **Redirect URI** i appregistreringen (type SPA, nøyaktig adresse med `/` til slutt).
2. **Lenkene** fra prosjektområdene (se under), som begynner med adressen.
3. **Klient-ID og tenant-ID** bygges inn ved bygg (repo-variabler) eller legges i `config.json` ved siden av `index.html`.

Med et eget domene (f.eks. `riskregister.firma.no`) kan appen senere flyttes mellom vertstjenester uten at lenkene på prosjektområdene må endres.

Dataene ligger uansett i SharePoint-listene på hvert prosjektområde. Hvor appen ligger, påvirker ikke hvor dataene lagres, og appen har ingen egen server.

## Lenke fra prosjektområdet

Appen er en ekstra klient til listene på prosjektområdet. Brukerne åpner den fra en lenke på området. Lenken peker på appen og forteller hvilket område registeret ligger på:

```
<appens adresse>?site=<områdets adresse, URL-kodet>
```

Eksempel for området `https://firma.sharepoint.com/sites/Prosjekt1234` og appen på `https://riskregister.firma.no/`:

```
https://riskregister.firma.no/?site=https%3A%2F%2Ffirma.sharepoint.com%2Fsites%2FProsjekt1234
```

Appen viser lenken ferdig laget når et register settes opp, og under **Mer › Kopier lenke til registeret**.

### Legge lenken i navigasjonen

Hvis området allerede har en overskrift «Riskregister» i navigasjonen (med visninger av listene under), legges lenken til som et nytt valg under den:

1. På områdets hjemmeside: **Rediger** nederst i navigasjonen til venstre (eller i toppmenyen på kommunikasjonsområder).
2. Hold over overskriften «Riskregister», trykk **…** › **Legg til underkobling** (eller **+** og flytt den inn under overskriften).
3. Velg **Kobling**, lim inn lenken, og gi den et navn, f.eks. «Åpne i Riskregister-appen». **Lagre**.

For mange områder kan det skriptes med PnP PowerShell:

```powershell
Connect-PnPOnline -Url https://firma.sharepoint.com/sites/Prosjekt1234 -Interactive
$site = "https://firma.sharepoint.com/sites/Prosjekt1234"
$lenke = "https://riskregister.firma.no/?site=" + [uri]::EscapeDataString($site)
$overskrift = Get-PnPNavigationNode -Location QuickLaunch | Where-Object Title -eq "Riskregister"
Add-PnPNavigationNode -Location QuickLaunch -Title "Åpne i Riskregister-appen" -Url $lenke -Parent $overskrift.Id
```

Lenken kan også ligge i en områdemal, så nye prosjektområder får den automatisk.

### Når IT lager listene

Appen kan lage listene selv (Sett opp riskregister på startsiden), men IT kan også lage dem, f.eks. med en områdemal. Da må listene hete og ha kolonnene som i tabellen under.

- **Registeret:** «Riskregister Risker» og «Riskregister Tiltak». Appen åpner registeret når begge finnes, og finner dem ut fra visningsnavnet (store og små bokstaver spiller ingen rolle). Kolonnene leses med internnavn.
- **Appens egne lister:** «Riskregister Klientinnstillinger», «Riskregister Klienttilstede», «Riskregister Snapshots» og «Riskregister Snapshotdata». Disse trenger ikke IT å lage. Appen lager dem første gang registeret åpnes av noen som har lov til å lage lister på området (eier). Til da virker registeret med standardinnstillinger, men uten låsing av risker og uten snapshots.
- Eldre registre med listene «Riskregister Innstillinger» og «Riskregister Tilstede» åpnes som før.

Slettes en kolonne i listene (f.eks. i SharePoint i nettleseren), sier appen fra når registeret åpnes. Resten lagres som før, mens feltene i kolonnen som mangler, ikke lagres. Den som kan endre listene, kan la appen lage kolonnen på nytt. Den blir tom, siden en slettet kolonne ikke havner i papirkurven. Mangler `RiskId` (eller `TiltakId` i Tiltak), åpnes ikke registeret, fordi radene da ikke kan knyttes til riskene.

Bruker piloten andre lister eller kolonner, kan koblingen tilpasses i `src/store/lister/skjema.ts`. Det krever en oversikt over listene og kolonnene (internnavn og type).

## Listene på hvert område

Når et register settes opp, lager appen disse listene på området (vanlige egendefinerte lister). Kolonnene er tekst, tall og ja/nei, slik at de er lette å lese i SharePoint og å hente ut til et datavarehus. Datoer lagres som tekst (`ÅÅÅÅ-MM-DD` eller ISO-tid).

| Liste | Innhold |
| --- | --- |
| Riskregister Risker | Én rad per risk: `RiskId` (indeksert), `Nr`, `RM`, `Aarsak`, `Hendelse`, `Konsekvenser`, `Eier`, `Status`, `Kategori`, `Egendef`, `Egendef2`, `FagId`, `Sannsynlighet`, `Konsekvens`, `BC`, `ML`, `WC`, `TilSkarisk`, `Kilde`, `EndretTid`, `EndretAv`, `OpprettetTid`, `OpprettetAv`, `LukketTid`, `LukketAv` |
| Riskregister Tiltak | Én rad per tiltak: `RiskId` (indeksert, peker på risken), `TiltakId`, `Rekkefolge`, `Tekst`, `Eier`, `Frist`, `Beskrivelse`, `Status` |
| Riskregister Klientinnstillinger | Én rad per nøkkel (`Title`), verdien som JSON i `Verdi`: `prosjekt`, `deltakere` (med e-post når deltakeren er koblet til en bruker), `gjennomganger`, `lister` (nedtrekkslister og fag), `nesteNr`, `registerId`, `opprettet`, `excelNokkel` |
| Riskregister Klienttilstede | Hvem som har registeret åpent, og hvilken risk de redigerer. Én rad per åpen økt, slettes når brukeren lukker |
| Riskregister Snapshots | Én rad per snapshot: `SnapshotId` (indeksert), `Tidspunkt`, `TattAv`, `AntallRisker`, `Kommentar`, `Register` (prosjektinfo og lister som JSON) |
| Riskregister Snapshotdata | Riskene slik de var da snapshotet ble tatt: `SnapshotId` (indeksert) og de samme kolonnene som i Risker, pluss `Tiltak` (JSON) |

`Title` er hendelsen for risker og teksten for tiltak, så listene er lesbare i SharePoint. Hele koblingen mellom appen og kolonnene ligger i `src/store/lister/skjema.ts`, slik at den kan tilpasses et annet listeoppsett.

Listene kan gjerne skjules fra navigasjonen. Brukerne trenger ikke å åpne dem direkte.

## Samtidig redigering

- Hver risk og hvert tiltak er en egen rad. Ved lagring skrives bare radene som er endret, med radens etag (`If-Match`). Har noen andre endret samme rad i mellomtiden, henter appen registeret på nytt og legger endringene oppå. To som endrer ulike risker, kommer aldri i konflikt.
- Mens en bruker redigerer en risk, er den låst for andre (via Klienttilstede-listen).
- Nye risker får nummer fra `nesteNr` i innstillingene, som skrives først. To som legger til en risk samtidig, får dermed ulike nummer.

## Belastning mot SharePoint

Per åpen bruker, omtrent:

| Kall | Hyppighet |
| --- | --- |
| Sjekk om listene er endret (`GET /sites/{id}/lists?$select=lastModifiedDateTime`) | hvert 3. sekund |
| Lese tilstedelisten | hvert 3. sekund |
| Skrive egen tilstederad | hvert 10. sekund og ved flytting |
| Hente registeret (alle rader i Risker, Tiltak og Klientinnstillinger) | ved endringer, og minst hvert 30. sekund |
| Lagre endrede rader (`$batch`, opptil 20 rader per kall) | ved endring, samlet over 2 sekunder |

Appen respekterer `Retry-After` ved struping (429/503). Intervallene kan økes ved behov.

## Snapshots

Et snapshot tas manuelt i appen (Mer › Snapshots og sammenligning). Riskene kopieres til Snapshotdata, og snapshot-raden skrives til slutt, slik at et avbrutt snapshot aldri vises. Snapshotene kan sammenlignes med registeret slik det er nå: endringer i BC, ML, WC, FV og summene vises i tabellen og oversikten, og piler i risikomatrisen viser hvordan riskene har flyttet seg.

## Eksport til datavarehus

Listene kan leses direkte med Graph (`/sites/{id}/lists/{liste}/items?$expand=fields`) eller med SharePoint-koblingen i Power BI / Data Factory. `RiskId` og `SnapshotId` er stabile nøkler.
