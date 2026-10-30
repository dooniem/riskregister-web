# Riskregister – oppsett hos IT

Riskregister er en nettapp som brukes som en ekstra klient til SharePoint-listene på hvert prosjektområde. Appen kjører i nettleseren og har ingen egen server, database eller hemmeligheter. All data ligger i listene på prosjektområdet, og appen leser og skriver dem med brukerens egen tilgang via Microsoft Graph.

For å teste i en egen tenant uten IT, se [Testmiljo.md](Testmiljo.md).

## Oversikt: dette trenger vi fra IT

| # | Hva | Hvem | Avsnitt |
| --- | --- | --- | --- |
| 1 | Lage en appregistrering i Entra ID, med appens adresse som redirect URI | IT | [Appregistrering](#1-appregistrering) |
| 2 | Sende klient-ID og tenant-ID til prosjektet | IT | [Appregistrering](#1-appregistrering) |
| 3 | Legge en lenke til appen på prosjektområdene, f.eks. i navigasjonen | IT eller prosjektet | [Lenke fra prosjektområdet](#2-lenke-fra-prosjektområdet) |
| 4 | Gi oss en oversikt over listene piloten bruker i dag, så appen kan tilpasses dem | IT | [Listene](#3-listene) |
| 5 | Kun med `Sites.Selected`: gi appen tilgang til hvert pilotområde | IT | [Sites.Selected](#alternativ-sitesselected) |

## Hvor appen ligger

Appen er statiske filer og kan ligge på hvilken som helst vertstjeneste med HTTPS. Planen er:

| Fase | Adresse | Merk |
| --- | --- | --- |
| Pilot | `https://dooniem.github.io/riskregister-web/` | GitHub Pages. Bygges og publiseres automatisk når koden endres. Ligger utenfor organisasjonens kontroll, men inneholder ingen data. |
| Senere (valgfritt) | Organisasjonens Azure Static Web Apps, f.eks. `https://riskregister.firma.no/` | Organisasjonen eier adressen og publiseringen. Gratisnivået holder. |

Adressen brukes to steder: som redirect URI i appregistreringen, og i lenkene fra prosjektområdene. Begge adressene kan stå som redirect URI samtidig, så appen kan flyttes uten nedetid. Med eget domene kan appen senere flyttes igjen uten at lenkene på prosjektområdene må endres.

En SharePoint Framework-webdel (appen inne på prosjektsiden) er mulig senere, men krever ombygging.

## 1. Appregistrering

1. **Entra ID › App registrations › New registration**
   - Navn: `Riskregister`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI: plattform **Single-page application (SPA)**, med appens adresse nøyaktig som i tabellen over, med `/` til slutt:
     - Pilot: `https://dooniem.github.io/riskregister-web/`
     - Ved flytting til Azure: legg i tillegg til den nye adressen, f.eks. `https://riskregister.firma.no/`
2. **API permissions › Add › Microsoft Graph › Delegated:**
   - `Sites.Manage.All` – lese og skrive listene på områder brukeren selv har tilgang til, og lage appens egne lister der de mangler (se [Listene](#3-listene)). Holder det at appen bare leser og skriver i lister som finnes, er `Sites.ReadWrite.All` nok.
   - `User.Read` – navnet på den innloggede brukeren.
   - `User.ReadBasic.All` – søk etter personer i organisasjonen (navn, e-post og stilling), så risikoeiere, tiltakseiere og deltakere kan kobles til ekte brukere. Appen ber om denne først når noen søker, så innloggingen virker også uten den.
3. **Grant admin consent**, slik at brukerne ikke får samtykkedialog.
4. Send **Application (client) ID** og **Directory (tenant) ID** til prosjektet. Ingen client secret trengs.

Tillatelsene er delegerte. Appen får aldri tilgang til mer enn den innloggede brukeren har i SharePoint. Har en bruker bare lesetilgang til området, kan registeret leses, men ikke endres.

### Alternativ: Sites.Selected

Med delegert `Sites.Selected` i stedet for `Sites.Manage.All` når appen bare områdene IT eksplisitt gir den tilgang til, og fortsatt bare det brukeren selv har tilgang til der.

1. **API permissions › Microsoft Graph › Delegated:** `Sites.Selected`, `User.Read` og `User.ReadBasic.All`. Grant admin consent.
2. Gi appen tilgang til hvert pilotområde, f.eks. med PnP PowerShell:
   ```powershell
   Grant-PnPAzureADAppSitePermission -AppId <klient-id> -DisplayName Riskregister -Site <områdets adresse> -Permissions Manage
   ```
   Eller med Graph: `POST /sites/{site-id}/permissions` med `{"roles": ["manage"], "grantedToIdentities": [{"application": {"id": "<klient-id>", "displayName": "Riskregister"}}]}`. Rollen `write` holder hvis appen ikke skal lage lister.
3. Prosjektet stiller appen inn for `Sites.Selected` (se [Tilkobling](#tilkobling-i-appen)).

Brukerne åpner registeret med lenken på prosjektområdet, så det er ingen forskjell for dem. Søket etter områder på appens startside virker ikke med `Sites.Selected`, men det trengs bare når man åpner appen uten lenke.

## 2. Lenke fra prosjektområdet

Brukerne åpner appen fra en lenke på prosjektområdet. Lenken består av appens adresse og adressen til området registeret ligger på:

```
<appens adresse>?site=<områdets adresse, URL-kodet>
```

Eksempel for området `https://firma.sharepoint.com/sites/Prosjekt1234`:

| Appen ligger på | Lenke |
| --- | --- |
| GitHub Pages (pilot) | `https://dooniem.github.io/riskregister-web/?site=https%3A%2F%2Ffirma.sharepoint.com%2Fsites%2FProsjekt1234` |
| Azure med eget domene | `https://riskregister.firma.no/?site=https%3A%2F%2Ffirma.sharepoint.com%2Fsites%2FProsjekt1234` |

Appen viser lenken ferdig laget under **Mer › Kopier lenke til registeret**.

### Legge lenken i navigasjonen

Hvis området har en overskrift «Riskregister» i navigasjonen, legges lenken til som et valg under den:

1. På områdets hjemmeside: **Rediger** nederst i navigasjonen til venstre (eller i toppmenyen på kommunikasjonsområder).
2. Hold over overskriften «Riskregister», trykk **…** › **Legg til underkobling**.
3. Velg **Kobling**, lim inn lenken, og gi den et navn, f.eks. «Åpne i Riskregister-appen». **Lagre**.

For mange områder kan det skriptes med PnP PowerShell. Bytt `$app` når appen flyttes:

```powershell
$app  = "https://dooniem.github.io/riskregister-web/"
$site = "https://firma.sharepoint.com/sites/Prosjekt1234"
Connect-PnPOnline -Url $site -Interactive
$lenke = $app + "?site=" + [uri]::EscapeDataString($site)
$overskrift = Get-PnPNavigationNode -Location QuickLaunch | Where-Object Title -eq "Riskregister"
Add-PnPNavigationNode -Location QuickLaunch -Title "Åpne i Riskregister-appen" -Url $lenke -Parent $overskrift.Id
```

Lenken kan også ligge i områdemalen, så nye prosjektområder får den automatisk.

## 3. Listene

Appen skal tilpasses listene piloten allerede bruker, ikke omvendt. Koblingen mellom appen og listene ligger samlet i `src/store/lister/skjema.ts`, og kan endres uten å røre resten av appen.

**Det vi trenger fra IT** er en oversikt over listene på et pilotområde: listenavn, og for hver kolonne visningsnavn, internnavn og type. Hvordan den hentes ut, er beskrevet i en egen instruks. Når vi har sett listene, kan vi også foreslå forenklinger, f.eks. om noen lister kan slås sammen.

Inntil oversikten finnes, bruker appen sitt eget standardoppsett. Det brukes også i demoen og når appen setter opp et nytt register selv.

### Appens standardoppsett

| Liste | Hvem lager den | Innhold |
| --- | --- | --- |
| Riskregister Risker | IT eller appen | Én rad per risk: `RiskId` (indeksert), `Nr`, `RM`, `Aarsak`, `Hendelse`, `Konsekvenser`, `Eier`, `Status`, `Kategori`, `Egendef`, `Egendef2`, `FagId`, `Sannsynlighet`, `Konsekvens`, `BC`, `ML`, `WC`, `TilSkarisk`, `Kilde`, `EndretTid`, `EndretAv`, `OpprettetTid`, `OpprettetAv`, `LukketTid`, `LukketAv` |
| Riskregister Tiltak | IT eller appen | Én rad per tiltak: `RiskId` (indeksert, peker på risken), `TiltakId`, `Rekkefolge`, `Tekst`, `Eier`, `Frist`, `Beskrivelse`, `Status` |
| Riskregister Snapshots | Appen | Én rad per snapshot: `SnapshotId` (indeksert), `Tidspunkt`, `TattAv`, `AntallRisker`, `Kommentar`, `Register` (prosjektinfo og lister som JSON) |
| Riskregister Snapshotdata | Appen | Riskene slik de var da snapshotet ble tatt: `SnapshotId` (indeksert), de samme kolonnene som i Risker, og `Tiltak` (JSON) |
| Riskregister Klientinnstillinger | Appen | Én rad per nøkkel (`Title`), med verdien som JSON i `Verdi`: prosjektinfo, deltakere, gjennomganger, nedtrekkslister, neste risknummer og valgte lister |
| Riskregister Klienttilstede | Appen | Hvem som har registeret åpent, og hvilken risk de redigerer. Brukes til å låse en risk mens noen skriver i den. Én rad per åpen økt, som slettes når brukeren lukker appen |

- Bare Risker og Tiltak må finnes for at registeret åpnes. Appen finner dem på visningsnavnet (store og små bokstaver spiller ingen rolle) og leser kolonnene med internnavn. Rekkefølgen på kolonnene spiller ingen rolle.
- De andre listene lager appen første gang registeret åpnes av en eier av området. Til da virker registeret, men uten låsing av risker og uten snapshots.
- Piloten har allerede en egen snapshot-liste. Appen tilpasses den når vi har sett oppsettet.
- Kolonnene er tekst, tall og ja/nei, så de er lette å lese i SharePoint og å hente ut til et datavarehus. Datoer lagres som tekst (`ÅÅÅÅ-MM-DD` eller ISO-tid). `Title` er hendelsen for risker og teksten for tiltak.
- Listene kan skjules fra navigasjonen. Brukerne trenger ikke å åpne dem direkte.
- Eldre testregistre med listene «Riskregister Innstillinger» og «Riskregister Tilstede» åpnes som før.

## Tilkobling i appen

Prosjektet legger klient-ID og tenant-ID inn i appen. IT trenger ikke å gjøre noe her. Appen bruker den første av disse som finnes:

1. **GitHub Pages:** repo-variablene `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` og eventuelt `AZURE_TILLATELSE=sites` (for `Sites.Selected`). De bygges inn når appen publiseres.
2. **Azure eller annen vertstjeneste:** en fil `config.json` ved siden av `index.html`, eller de samme verdiene som miljøvariabler (`VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `VITE_AZURE_TILLATELSE`) ved bygging.
3. **Testing:** Tilkoblingsinnstillinger på appens startside. Lagres bare i nettleseren.

Startsiden viser hvilken tenant appen er koblet til, og hvor innstillingen kom fra.

## Når listene endres direkte i SharePoint

Listene kan fortsatt redigeres i SharePoint i nettleseren. Appen tåler det, og forklarer brukeren hva som har skjedd:

- **Liste omdøpt eller slettet:** finner ikke appen Risker eller Tiltak, viser den listene på området og lar brukeren velge hvilke som skal brukes. Bare lister med nøkkelkolonnene (`RiskId`, og `TiltakId` for tiltak) kan velges. Valget lagres som liste-ID, så det tåler at listene får nytt navn senere.
- **Kolonne slettet:** appen sier fra hvilke kolonner som mangler, og lagrer resten som vanlig. Den som kan endre listene, kan la appen lage kolonnen på nytt, men den blir tom, siden en slettet kolonne ikke havner i papirkurven. Mangler `RiskId` eller `TiltakId`, åpnes ikke registeret.
- **Risk slettet, men ikke tiltakene:** tiltakene slettes ikke. Brukeren kan hente risken fra papirkurven på området, lage den på nytt i appen, eller slette tiltakene.
- **Risk kopiert,** slik at samme `RiskId` finnes flere ganger: den eldste raden brukes, og kopiene kan gjøres til egne risker eller slettes.
- **Rad i Klientinnstillinger ødelagt:** raden skrives ikke over før brukeren velger det. Versjonsloggen til raden viser tidligere verdier.

Vi anbefaler at versjonshistorikken på listene står på (det gjør den som standard), slik at enkeltrader kan gjenopprettes.

## Teknisk

### Samtidig redigering

- Hver risk og hvert tiltak er en egen rad. Ved lagring skrives bare radene som er endret, med radens etag (`If-Match`). Har noen andre endret samme rad i mellomtiden, henter appen registeret på nytt og legger endringene oppå. To som endrer ulike risker, kommer aldri i konflikt.
- Mens en bruker redigerer en risk, er den låst for andre (via Klienttilstede).
- Endringer som ikke er lagret, tas vare på i nettleseren hvis nettet faller ut, fanen lukkes eller innloggingen må fornyes. Har noen andre endret samme felt i mellomtiden, velger brukeren hvilken verdi som skal gjelde.

### Belastning mot SharePoint

Per åpen bruker, omtrent:

| Kall | Hyppighet |
| --- | --- |
| Sjekk om listene er endret (`GET /sites/{id}/lists?$select=lastModifiedDateTime`) | hvert 3. sekund |
| Lese Klienttilstede | hvert 3. sekund |
| Skrive egen rad i Klienttilstede | hvert 10. sekund og ved flytting |
| Hente registeret (alle rader i Risker, Tiltak og Klientinnstillinger) | ved endringer, og minst hvert 30. sekund |
| Lagre endrede rader (`$batch`, opptil 20 rader per kall) | ved endring, samlet over 2 sekunder |

Appen respekterer `Retry-After` ved struping (429/503). Intervallene kan økes ved behov.

### Snapshots

Et snapshot tas manuelt i appen (**Mer › Snapshots og sammenligning**). Riskene kopieres til Snapshotdata, og snapshot-raden skrives til slutt, slik at et avbrutt snapshot aldri vises. Snapshots kan sammenlignes med registeret slik det er nå.

### Eksport til datavarehus

Listene kan leses direkte med Graph (`/sites/{id}/lists/{liste}/items?$expand=fields`) eller med SharePoint-koblingen i Power BI eller Data Factory. `RiskId` og `SnapshotId` er stabile nøkler.
