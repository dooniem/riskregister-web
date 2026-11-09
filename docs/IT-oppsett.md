# IT-oppsett for Riskregister

## 1. Formål og arkitektur

Riskregister er en nettapp som fungerer som en alternativ brukerflate for SharePoint-listene på hvert prosjektområde.

Appen:

- kjører i nettleseren
- har ingen egen server eller database
- lagrer ikke prosjektdata eller hemmeligheter i vertstjenesten
- leser og skriver data i SharePoint via Microsoft Graph
- bruker den innloggede brukerens eksisterende tilgang til prosjektområdet

Alle registerdata blir dermed liggende i prosjektets SharePoint-område.

---

## 2. Dette må avklares eller utføres av IT

| Nr. | Oppgave | Ansvar | Se avsnitt |
|---:|---|---|---|
| 1 | Velge Microsoft Graph-tillatelse for appen. Anbefalt løsning er `Sites.Manage.All`. | IT | [Valg av Graph-tillatelse](#4-valg-av-graph-tillatelse) |
| 2 | Opprette en appregistrering i Microsoft Entra ID. | IT | [Appregistrering i Entra ID](#5-appregistrering-i-entra-id) |
| 3 | Sende klient-ID og tenant-ID til utvikleren av klienten. | IT | [Opplysninger prosjektet trenger](#opplysninger-prosjektet-trenger) |
| 4 | Legge inn lenke til appen på aktuelle prosjektområder. | IT eller prosjektet | [Lenke fra prosjektområdet](#7-lenke-fra-prosjektområdet) |
| 5 | Levere en oversikt over SharePoint-listene som brukes i piloten. | IT | [Eksisterende SharePoint-lister](#8-eksisterende-sharepoint-lister) |
| 6 | Ved bruk av `Sites.Selected`: gi appen tilgang til hvert pilotområde. | IT | [Tilgang til hvert område med Sites.Selected](#6-tilgang-til-hvert-område-med-sitesselected) |
| 7 | Dersom prosjektbrukerne ikke kan endre listestrukturen: opprette nødvendige lister og kolonner. | IT | [Hvem kan opprette lister og kolonner?](#hvem-kan-opprette-lister-og-kolonner) |
| 8 | Indeksere nøkkelkolonner og kontrollere innstillingene for versjonshistorikk. | IT | [Indekser og versjonshistorikk](#10-indekser-og-versjonshistorikk) |

### Anbefalt beslutningsrekkefølge

1. Velg Graph-tillatelse.
2. Opprett appregistreringen.
3. Send klient-ID og tenant-ID til utvikleren av klienten.
4. Avklar hvor appen skal publiseres i piloten og etter piloten.
5. Kartlegg eksisterende lister og kolonner.
6. Opprett eller juster lister, kolonner, indekser og versjonsinnstillinger.
7. Legg lenken til appen inn på pilotområdene.

---

## 3. Publisering av appen

Appen består av statiske filer og kan publiseres på en hvilken som helst HTTPS-tjeneste.

| Fase | Adresse | Beskrivelse |
|---|---|---|
| Pilot | `https://dooniem.github.io/riskregister-web/` | Publisering med GitHub Pages. Appen bygges og publiseres automatisk når koden endres. Løsningen ligger utenfor organisasjonens kontroll, men vertstjenesten mottar eller lagrer ikke registerdata. |
| Senere, valgfritt | For eksempel `https://riskregister.firma.no/` | Publisering i organisasjonens Azure Static Web Apps. Organisasjonen kontrollerer adresse og publisering. Gratisnivået vil normalt være tilstrekkelig. |

Appadressen brukes:

1. som redirect URI i Entra ID-appregistreringen
2. i lenkene som legges på prosjektområdene

Flere adresser kan registreres samtidig som redirect URI. Pilotadressen og en senere Azure-adresse kan derfor fungere parallelt under en overgang.

Med et eget domene, for eksempel `riskregister.firma.no`, kan vertsløsningen senere byttes uten å endre lenkene på prosjektområdene.

> **Mulig senere løsning:** Appen kan bygges om til en SharePoint Framework-webdel og vises direkte på prosjektsiden. Dette krever en egen ombygging og inngår ikke i dagens løsning.

---

## 4. Valg av Graph-tillatelse

Tillatelsene er **delegerte**. Appen får derfor aldri større datatilgang enn den innloggede brukeren allerede har i SharePoint.

En bruker med lesetilgang kan lese registeret, men ikke endre det. En bruker med redigeringstilgang kan skrive data. Muligheten til å opprette lister, kolonner og indekser avhenger både av valgt Graph-tillatelse og brukerens SharePoint-rettigheter.

### Alternativer

| Prioritet | Tillatelse | Fordeler | Begrensninger |
|---:|---|---|---|
| 1 | `Sites.Manage.All` | Appen kan opprette og vedlikeholde egne lister, kolonner og indekser på områder brukeren har tilgang til. Krever ikke ny IT-bestilling for hvert prosjektområde. Søk etter områder på startsiden kan brukes. | Bred tillatelse. Appen kan arbeide mot alle områder der brukeren både har tilgang og rett til å endre listestrukturen. |
| 2 | `Sites.Selected` med rollen `manage` | Appen når bare områder som IT uttrykkelig har godkjent. Den kan opprette lister, kolonner og indekser på disse områdene. | IT må gi tilgang separat til hvert område. Søk etter områder på startsiden virker ikke. Brukerne må åpne appen fra lenken på prosjektområdet. |
| 3 | `Sites.ReadWrite.All` | Appen kan lese og skrive listeelementer på områder brukeren har tilgang til. | Appen kan ikke opprette eller endre lister, kolonner og indekser. IT må utføre alle strukturendringer, også når en ny appversjon krever en ny kolonne. |
| 4 | `Sites.Selected` med rollen `write` | Smalest mulig tilgang. Appen kan bare lese og skrive listeelementer på områder IT har valgt. | Kombinerer begrensningene i alternativ 2 og 3: IT må godkjenne hvert område og håndtere alle strukturendringer. |

### Anbefaling

`Sites.Manage.All` gir enklest forvaltning og minst løpende arbeid for IT. Dersom organisasjonen krever eksplisitt avgrensning til bestemte prosjektområder, brukes `Sites.Selected` med rollen `manage`.

Tillatelsen påvirkes ikke av hvor appen publiseres. Den delegerte Graph-tilgangen er den samme enten appen ligger på GitHub Pages eller i Azure. Ingen SharePoint-data går via vertstjenesten.

---

## 5. Appregistrering i Entra ID

### Opprett registreringen

Gå til:

**Microsoft Entra ID → App registrations → New registration**

[entra.microsoft.com](https://entra.microsoft.com)

Bruk følgende innstillinger:

- **Name:** `Riskregister`
- **Supported account types:** `Accounts in this organizational directory only`
- **Redirect URI platform:** `Single-page application (SPA)`
- **Redirect URI for pilot:** `https://dooniem.github.io/riskregister-web/`

Redirect URI må være nøyaktig og skal ha avsluttende `/`.

Ved senere flytting til Azure legges den nye adressen til som en ekstra redirect URI, for eksempel:

```text
https://riskregister.firma.no/
```

### API-tillatelser

Gå til:

**API permissions → Add a permission → Microsoft Graph → Delegated permissions**

Legg til:

- én av følgende områdetillatelser:
  - `Sites.Manage.All`
  - `Sites.ReadWrite.All`
  - `Sites.Selected`
- `User.Read`
- `User.ReadBasic.All`

`User.Read` brukes for å vise navnet til den innloggede brukeren.

`User.ReadBasic.All` brukes når noen søker etter personer i organisasjonen, slik at risikoeiere, tiltakseiere og deltakere kan kobles til reelle brukere med navn, e-postadresse og stilling. Appen ber først om denne tilgangen når personsøket brukes. Ordinær innlogging fungerer derfor også uten tillatelsen.

Velg deretter **Grant admin consent**, slik at sluttbrukerne ikke blir møtt med en samtykkedialog.

Det skal ikke opprettes noen client secret. En SPA skal ikke inneholde en hemmelig klientnøkkel.

### Opplysninger prosjektet trenger

Send følgende verdier til prosjektet:

- **Application (client) ID**
- **Directory (tenant) ID**
- valgt områdetillatelse, særlig om løsningen bruker `Sites.Selected`

---

## 6. Tilgang til hvert område med Sites.Selected

Dette avsnittet gjelder bare når appregistreringen bruker `Sites.Selected`.

IT må gi appen tilgang til hvert prosjektområde som skal bruke Riskregister.

### Med PnP PowerShell

```powershell
Grant-PnPAzureADAppSitePermission `
  -AppId <klient-id> `
  -DisplayName "Riskregister" `
  -Site <områdets-adresse> `
  -Permissions Manage
```

Bruk `Write` i stedet for `Manage` dersom alternativ 4 er valgt.

### Med Microsoft Graph

```http
POST /sites/{site-id}/permissions
```

Eksempel på innhold for rollen `manage`:

```json
{
  "roles": ["manage"],
  "grantedToIdentities": [
    {
      "application": {
        "id": "<klient-id>",
        "displayName": "Riskregister"
      }
    }
  ]
}
```

Prosjektet må i tillegg konfigurere appen for `Sites.Selected`, se [Tilkobling og konfigurasjon](#11-tilkobling-og-konfigurasjon).

For brukerne er arbeidsmåten den samme: De åpner registeret fra lenken på prosjektområdet.

---

## 7. Lenke fra prosjektområdet

Brukerne bør åpne appen fra en lenke på det aktuelle prosjektområdet. Lenken inneholder både appadressen og adressen til SharePoint-området.

Format:

```text
<appadresse>?site=<URL-kodet-adresse-til-prosjektområdet>
```

Eksempel for prosjektområdet:

```text
https://firma.sharepoint.com/sites/Prosjekt1234
```

Pilotlenke:

```text
https://dooniem.github.io/riskregister-web/?site=https%3A%2F%2Ffirma.sharepoint.com%2Fsites%2FProsjekt1234
```

Eksempel med eget Azure-domene:

```text
https://riskregister.firma.no/?site=https%3A%2F%2Ffirma.sharepoint.com%2Fsites%2FProsjekt1234
```

Appen kan lage lenken automatisk under:

**Mer → Kopier lenke til registeret**

### Legg lenken i navigasjonen

Dersom prosjektområdet har en navigasjonsoverskrift som heter **Riskregister**:

1. Åpne prosjektområdets hjemmeside.
2. Velg **Rediger** nederst i venstremenyen. På kommunikasjonsområder redigeres toppmenyen.
3. Hold pekeren over **Riskregister**.
4. Velg **… → Legg til underkobling**.
5. Velg **Kobling**.
6. Lim inn app-lenken.
7. Bruk for eksempel navnet **Åpne i Riskregister-appen**.
8. Velg **Lagre**.

### Legg lenken inn med PnP PowerShell

```powershell
$app  = "https://dooniem.github.io/riskregister-web/"
$site = "https://firma.sharepoint.com/sites/Prosjekt1234"

Connect-PnPOnline -Url $site -Interactive

$lenke = $app + "?site=" + [uri]::EscapeDataString($site)
$overskrift = Get-PnPNavigationNode -Location QuickLaunch |
  Where-Object Title -eq "Riskregister"

Add-PnPNavigationNode `
  -Location QuickLaunch `
  -Title "Åpne i Riskregister-appen" `
  -Url $lenke `
  -Parent $overskrift.Id
```

Lenken kan også inngå i områdemalen, slik at nye prosjektområder får den automatisk.

---

## 8. Eksisterende SharePoint-lister

Appen skal tilpasses listene som piloten allerede bruker. Eksisterende prosjektdata skal ikke måtte flyttes til appens standardstruktur dersom dagens lister kan gjenbrukes.

Koblingen mellom appen og SharePoint-listene er samlet i:

```text
src/store/lister/skjema.ts
```

Dette gjør det mulig å endre listetilpasningen uten å bygge om resten av appen.

### Informasjon IT må hente fra pilotområdet

For hver liste trenger prosjektet:

- listenavn
- kolonnenes visningsnavn
- kolonnenes internnavn
- kolonnetype

Fremgangsmåten for å hente informasjonen er beskrevet i en egen instruks.

Når oversikten foreligger, kan prosjektet:

- koble appen mot dagens lister
- identifisere manglende kolonner
- vurdere om strukturen kan forenkles
- vurdere om enkelte lister kan slås sammen

Inntil eksisterende struktur er kartlagt, bruker appen standardoppsettet nedenfor. Det samme oppsettet brukes i demoen og når appen oppretter et nytt register.

---

## 9. Appens standardoppsett

| Liste | Opprettes av | Formål og sentrale kolonner |
|---|---|---|
| **Riskregister Risker** | IT eller appen | Én rad per risiko. Sentrale felt: `RiskId`, `Nr`, `RM`, `Aarsak`, `Hendelse`, `Konsekvenser`, `Eier`, `Status`, `Kategori`, `FagId`, `Sannsynlighet`, `Konsekvens`, `BC`, `ML`, `WC`, `TilSkarisk`, `Kilde`, `Vedlegg`, `Markering` og felter for opprettelse, endring og lukking. `RiskId` skal indekseres. |
| **Riskregister Tiltak** | IT eller appen | Én rad per tiltak. Sentrale felt: `RiskId`, `TiltakId`, `Rekkefolge`, `Tekst`, `Eier`, `Frist`, `Beskrivelse`, `Status` og `Markering`. `RiskId` skal indekseres. |
| **Riskregister Snapshots** | Appen | Én rad per snapshot. Felt: `SnapshotId`, `Tidspunkt`, `TattAv`, `AntallRisker`, `Kommentar` og `Register`. `SnapshotId` skal indekseres. |
| **Riskregister Snapshotdata** | Appen | Kopi av risikoene på snapshottidspunktet, inkludert tiltak lagret som JSON. `SnapshotId` skal indekseres. |
| **Riskregister Klientinnstillinger** | Appen | Én rad per innstillingsnøkkel. Verdien lagres som JSON i `Verdi`. Brukes blant annet til prosjektinformasjon, deltakere, gjennomganger, nedtrekkslister, neste risikonummer og valgte lister. |
| **Riskregister Klienttilstede** | Appen | Viser hvem som har registeret åpent, og hvilken risiko vedkommende redigerer. Brukes til redigeringslås. Én rad opprettes per åpen økt og slettes når appen lukkes. |

### Viktige forutsetninger

- Bare listene **Risker** og **Tiltak** må finnes for at registeret skal kunne åpnes.
- Appen finner disse listene etter visningsnavn. Store og små bokstaver spiller ingen rolle.
- Kolonnene leses etter internnavn. Kolonnerekkefølgen spiller ingen rolle.
- Øvrige lister kan opprettes første gang appen åpnes av en bruker som kan endre listestrukturen.
- Frem til støttelistene er opprettet, virker registeret uten redigeringslås og snapshots.
- Pilotens eksisterende snapshot-liste tilpasses når dagens oppsett er kartlagt.
- Kolonnene bruker hovedsakelig tekst, tall og ja/nei. Dette gjør dem enkle å lese i SharePoint og hente ut til et datavarehus.
- Datoer lagres som tekst i formatet `ÅÅÅÅ-MM-DD` eller som ISO-tid.
- `Title` brukes som hendelse for risikoer og som tiltakstekst for tiltak.
- Listene kan skjules fra SharePoint-navigasjonen. Brukerne trenger normalt ikke åpne dem direkte.
- Eldre testregistre med listene **Riskregister Innstillinger** og **Riskregister Tilstede** støttes fortsatt.

### Hvem kan opprette lister og kolonner?

Ved delegerte tillatelser må både appen og brukeren ha tilstrekkelig tilgang.

For at appen skal kunne opprette eller endre listestrukturen, kreves:

- `Sites.Manage.All`, eller `Sites.Selected` med rollen `manage`
- en innlogget bruker som kan endre lister på prosjektområdet

Områdeeiere og brukere med tilgangsnivået **Rediger** kan normalt gjøre dette. Brukere med **Bidra** kan lese og skrive listeelementer, men kan ikke opprette kolonner.

Konsekvens:

- Manglende lister og kolonner opprettes første gang registeret åpnes av en eier eller bruker med **Rediger**.
- Før dette skjer, viser appen hva som mangler og lagrer øvrige data som normalt.
- Dersom ingen prosjektbrukere har mer enn **Bidra**, må IT opprette lister og kolonner.
- Samme begrensning gjelder senere hvis en appoppdatering krever nye kolonner.

---

## 10. Indekser og versjonshistorikk

### Indekser

SharePoint har en listevisningsterskel på 5 000 elementer. Filtrering på en ikke-indeksert kolonne kan slutte å virke når listen passerer denne grensen.

Dette er særlig viktig for `Snapshotdata`, som får én rad per risiko per snapshot. Med 300 risikoer og ett snapshot per måned passeres 5 000 rader etter omtrent 17 måneder.

Indeksene bør opprettes mens listene fortsatt er små. SharePoint kan nekte å opprette en indeks når listen allerede er stor.

| Liste | Internnavn på kolonne | Krav |
|---|---|---|
| Riskregister Snapshotdata | `SnapshotId` | Påkrevd |
| Riskregister Snapshots | `SnapshotId` | Påkrevd |
| Riskregister Risker | `RiskId` | Anbefalt |
| Riskregister Tiltak | `RiskId` | Anbefalt |

Dersom listene har andre navn, gjelder kravet tilsvarende lister og nøkkelkolonner.

#### Opprett indeks i SharePoint

1. Åpne listen.
2. Velg **Innstillinger → Listeinnstillinger**.
3. Velg **Indekserte kolonner**.
4. Velg **Opprett en ny indeks**.
5. Velg aktuell kolonne som **Primærkolonne**.
6. Velg **Opprett**.

#### Opprett indekser med PnP PowerShell

```powershell
Connect-PnPOnline -Url <områdets-adresse> -Interactive

Set-PnPField -List "Riskregister Snapshotdata" -Identity SnapshotId -Values @{ Indexed = $true }
Set-PnPField -List "Riskregister Snapshots"    -Identity SnapshotId -Values @{ Indexed = $true }
Set-PnPField -List "Riskregister Risker"       -Identity RiskId     -Values @{ Indexed = $true }
Set-PnPField -List "Riskregister Tiltak"       -Identity RiskId     -Values @{ Indexed = $true }
```

#### Opprett indeks med Microsoft Graph

```http
PATCH /sites/{site-id}/lists/{list-id}/columns/{column-id}
Content-Type: application/json

{
  "indexed": true
}
```

#### Reservefunksjon i appen

Når **Snapshots** eller **Snapshotdata** har passert 4 000 rader og `SnapshotId` ikke er indeksert, forsøker appen å aktivere indeksen.

Dette lykkes bare dersom:

- brukeren kan endre listen
- appen har `Sites.Manage.All`, eller `Sites.Selected` med rollen `manage`

Hvis dette ikke er mulig, viser appen et varsel til brukeren. Reservefunksjonen erstatter ikke planlagt oppsett. Kolonnene bør indekseres når listene opprettes.

### Versjonshistorikk

Versjonshistorikk skal være aktivert. Appen bruker historikken til å:

- vise tidligere endringer i en risiko
- hente tilbake tidligere feltverdier

SharePoint beholder bare et konfigurert antall versjoner per listeelement. Eldre versjoner slettes automatisk når grensen passeres. En risiko som følges opp i flere år, kan få mer enn 50 endringer.

**Anbefalt innstilling:** 500 hovedversjoner for:

- Riskregister Risker
- Riskregister Tiltak
- Riskregister Klientinnstillinger

Listeelementene er små, så lagringsøkningen forventes å være begrenset. Flere versjoner gir lengre historikk, men ingen annen funksjonell gevinst.

#### Endre innstillingen i SharePoint

Gå til:

**Listeinnstillinger → Innstillinger for versjonskontroll → Behold følgende antall hovedversjoner**

Angi `500`.

#### Endre innstillingen med PnP PowerShell

```powershell
foreach ($liste in @(
  "Riskregister Risker",
  "Riskregister Tiltak",
  "Riskregister Klientinnstillinger"
)) {
  Set-PnPList -Identity $liste -EnableVersioning $true -MajorVersions 500
}
```

---

## 11. Tilkobling og konfigurasjon

Prosjektet legger klient-ID og tenant-ID inn i appen. IT trenger ikke å gjøre ytterligere arbeid etter at verdiene er sendt.

Appen bruker den første gyldige konfigurasjonen den finner.

### GitHub Pages

Følgende repository-variabler brukes:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_TILLATELSE=sites
```

`AZURE_TILLATELSE=sites` brukes bare ved `Sites.Selected`. Verdiene bygges inn når appen publiseres.

### Azure eller annen vertstjeneste

Konfigurasjonen kan ligge i en `config.json` ved siden av `index.html`, eller angis som miljøvariabler ved bygging:

```text
VITE_AZURE_CLIENT_ID
VITE_AZURE_TENANT_ID
VITE_AZURE_TILLATELSE
```

### Testing

Tilkoblingsinnstillinger kan legges inn på appens startside. Disse lagres bare lokalt i nettleseren.

Startsiden viser:

- hvilken tenant appen er koblet til
- hvor konfigurasjonsverdiene ble hentet fra

---

## 12. Endringer gjort direkte i SharePoint

Listene kan fortsatt redigeres direkte i SharePoint. Appen håndterer vanlige struktur- og dataproblemer på følgende måte.

### Liste er omdøpt eller slettet

Hvis appen ikke finner listene for risikoer eller tiltak, viser den tilgjengelige lister på området og lar brukeren velge riktige lister.

Bare lister med nødvendige nøkkelkolonner kan velges:

- `RiskId` for risikoer
- `RiskId` og `TiltakId` for tiltak

Valget lagres som liste-ID. Appen tåler derfor at listen senere får et nytt navn.

### Kolonne er slettet

Appen viser hvilke kolonner som mangler og lagrer øvrige felt som normalt.

En bruker med rett til å endre listestrukturen kan be appen opprette kolonnen på nytt. Den nye kolonnen vil være tom, fordi en slettet SharePoint-kolonne ikke flyttes til papirkurven.

Hvis `RiskId` eller `TiltakId` mangler, kan registeret ikke åpnes.

### Risiko er slettet, men tiltakene ligger igjen

Tiltakene slettes ikke automatisk. Brukeren kan:

- gjenopprette risikoen fra områdets papirkurv
- opprette risikoen på nytt i appen
- slette de gjenværende tiltakene

### En risiko er kopiert

Dersom flere rader har samme `RiskId`, bruker appen den eldste raden. Kopiene kan deretter gjøres om til selvstendige risikoer eller slettes.

### En innstillingsrad er ødelagt

En ugyldig rad i **Klientinnstillinger** overskrives ikke automatisk. Brukeren må aktivt velge å erstatte den. Tidligere verdier kan finnes i radens versjonshistorikk.

---

## 13. Teknisk funksjon

### Samtidig redigering

- Hver risiko og hvert tiltak lagres som et eget listeelement.
- Ved lagring skrives bare rader som er endret.
- Appen sender radens `etag` med `If-Match` for å oppdage samtidige endringer.
- Hvis samme rad er endret av en annen bruker, henter appen registeret på nytt og forsøker å legge de lokale endringene oppå den nyeste versjonen.
- Brukere som redigerer forskjellige risikoer, kommer ikke i konflikt.
- En risiko låses for andre mens én bruker redigerer den. Låsen håndteres i **Klienttilstede**.
- Ulagrede endringer beholdes lokalt i nettleseren hvis nettet faller ut, fanen lukkes eller innloggingen må fornyes.
- Hvis samme felt er endret av andre i mellomtiden, får brukeren velge hvilken verdi som skal beholdes.

### Belastning mot SharePoint

Omtrentlig trafikk per bruker som har appen åpen:

| Operasjon | Hyppighet |
|---|---|
| Kontrollere om lister er endret med `GET /sites/{id}/lists?$select=lastModifiedDateTime` | Hvert 3. sekund |
| Lese listen Klienttilstede | Hvert 3. sekund |
| Oppdatere egen rad i Klienttilstede | Hvert 10. sekund og ved flytting mellom risikoer |
| Hente alle rader fra Risker, Tiltak og Klientinnstillinger | Ved endringer og minst hvert 30. sekund |
| Lagre endrede rader med `$batch`, maksimalt 20 rader per kall | Ved endring, samlet over 2 sekunder |

Appen følger `Retry-After` ved struping med statuskode `429` eller `503`. Intervallene kan økes dersom SharePoint-belastningen blir for høy.

### Snapshots

Snapshots tas manuelt under:

**Mer → Snapshots og sammenligning**

Fremgangsmåte:

1. Risikoene kopieres til **Snapshotdata**.
2. Snapshot-raden opprettes i **Snapshots** til slutt.

Et avbrutt snapshot blir dermed ikke synlig som et fullført snapshot. Lagrede snapshots kan sammenlignes med gjeldende register.

### Eksport til datavarehus

Listene kan hentes direkte gjennom Microsoft Graph:

```http
/sites/{id}/lists/{liste}/items?$expand=fields
```

De kan også leses med SharePoint-koblingen i blant annet Power BI eller Azure Data Factory.

Følgende felter brukes som stabile nøkler:

- `RiskId`
- `SnapshotId`

---

## 14. Kort sjekkliste før pilot

- [ ] Graph-tillatelse er valgt.
- [ ] Appregistreringen er opprettet som SPA i Entra ID.
- [ ] Redirect URI er registrert med avsluttende `/`.
- [ ] Nødvendige delegerte API-tillatelser er lagt til.
- [ ] Admin consent er gitt.
- [ ] Klient-ID og tenant-ID er sendt til prosjektet.
- [ ] Ved `Sites.Selected` har appen fått tilgang til hvert pilotområde.
- [ ] Eksisterende lister og kolonner er kartlagt.
- [ ] Nødvendige lister og kolonner finnes.
- [ ] `SnapshotId` og `RiskId` er indeksert som angitt.
- [ ] Versjonshistorikk er aktivert og ønsket versjonsgrense er satt.
- [ ] Appen er konfigurert med klient-ID og tenant-ID.
- [ ] App-lenken er lagt inn på pilotområdene.
- [ ] Innlogging, lesing, lagring, personsøk og snapshot er testet med en vanlig prosjektbruker.
