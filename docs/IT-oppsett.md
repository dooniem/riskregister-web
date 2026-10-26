# Oppsett hos IT

Appen trenger én appregistrering i Entra ID. Den har ingen egen server, database eller hemmeligheter, og stiller ingen krav til hvordan SharePoint-områdene eller dokumentbibliotekene er satt opp.

## Appregistrering

1. Entra ID › App registrations › New registration
   - Navn: `Riskregister`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI: plattform **Single-page application (SPA)**, adresse = der appen ligger, f.eks. `https://riskregister.firma.no/` (eksakt, med avsluttende `/`)
2. API permissions › Add › Microsoft Graph › **Delegated**:
   - `Files.ReadWrite.All` – lese og skrive filer brukeren selv har tilgang til
   - `User.Read` – navnet på brukeren
3. Grant admin consent (anbefalt, slik at brukerne ikke får samtykkedialog)
4. Send **Application (client) ID** og **Directory (tenant) ID** til den som drifter appen. Ingen client secret trengs.

Delegerte tillatelser betyr at appen aldri får tilgang til mer enn den innloggede brukeren har i SharePoint. Har en bruker ikke tilgang til et prosjektområde, svarer Graph 403 og appen viser «ingen tilgang».

### Alternativ for pilot: Sites.Selected

I stedet for `Files.ReadWrite.All` kan appen få delegert `Sites.Selected`. Da når appen bare de SharePoint-områdene IT eksplisitt gir den tilgang til, og fortsatt bare det den innloggede brukeren selv har tilgang til der. Selvbetjeningen faller bort, siden hvert nytt prosjektområde må legges til av IT, men det passer godt for en pilot på ett eller to områder.

1. API permissions › Microsoft Graph › **Delegated** › `Sites.Selected` (og `User.Read`), og grant admin consent.
2. Gi appen skrivetilgang til hvert pilotområde, f.eks. med Graph: `POST /sites/{site-id}/permissions` med `{"roles": ["write"], "grantedToIdentities": [{"application": {"id": "<client id>", "displayName": "Riskregister"}}]}`, eller PowerShell `Grant-PnPAzureADAppSitePermission -AppId <client id> -DisplayName Riskregister -Site <område-url> -Permissions Write`.
3. I appen velges **Sites.Selected** under Tilkoblingsinnstillinger på startsiden (eller repo-variabelen `AZURE_TILLATELSE=sites` ved bygg).

Med Sites.Selected åpnes registre med adressen fra nettleserens adresselinje. Delingslenker («Kopier kobling») virker ikke alltid.

Valget av tillatelse i appen er midlertidig og fjernes når det er avklart hva som skal brukes.

## Hosting

Statiske filer (`dist/`). Alternativer:

- Azure Static Web Apps (gratisnivå holder)
- GitHub Pages fra dette repoet (krever offentlig repo eller betalt GitHub-plan)
- Senere: SharePoint Framework-webdel, så appen ligger inne på prosjektsiden

## Belastning mot SharePoint

Per åpen bruker, omtrent:

| Kall | Hyppighet |
| --- | --- |
| Sjekk om registeret er endret (`GET item?$select=eTag`) | hvert 3. sekund |
| Liste tilstedeværelsesfiler i `_tilstede` | hvert 3. sekund |
| Laste ned endrede tilstedeværelsesfiler | ved endring |
| Skrive egen tilstedeværelsesfil | hvert 10. sekund og ved flytting |
| Lagre `register.json` (`PUT` med `If-Match`) | ved endring, høyst hvert 5. sekund per bruker (endringer samles) |

Det gir rundt 1–2 kall i sekundet per bruker, og 10–20 i sekundet med 10 brukere i samme register. Appen respekterer `Retry-After` ved struping (429/503). Intervallene kan økes ved behov.

## Filer appen lager i prosjektmappen

```
Riskregister/
  register.json            selve registeret
  Åpne Riskregister.url    snarvei som åpner appen med dette registeret
  _tilstede/<bruker-id>~<økt>~<n>.json   hvem som er inne nå (slettes når brukeren lukker)
  _historikk/register <fra> til <til> <tid>.json  de 3 siste arkiverte utgavene av register.json
```

## Versjonshistorikk og versjonstak

Hver lagring blir en ny versjon av filen i SharePoint. I dokumentbiblioteker der **delversjoner** (0.1, 0.2 …) er slått på, slutter SharePoint å ta imot lagringer når en fil har nådd 511 delversjoner, til noen publiserer en hovedversjon. Det kjenner mange fra Excel- og Word-filer.

Appen er laget slik at ingen fil kommer i nærheten av taket, uansett hvordan biblioteket er satt opp. Det kreves ingen spesielle innstillinger fra IT og ingen handlinger fra brukerne:

- Etter 400 lagringer flyttes `register.json` til `_historikk` med datoene den var i bruk i navnet, f.eks. `register 2026-09-01 til 2026-10-26 14.05.json`, og en ny `register.json` lages. Den arkiverte filen tar med seg sin egen versjonshistorikk.
- Bare de **3 nyeste** arkivfilene beholdes. Når en fjerde lages, slettes den eldste (den havner i papirkurven i SharePoint). Det ligger altså aldri mer enn 3 filer i `_historikk`, og til sammen dekker de de siste 1200 lagringene. Hvor lang tid det tilsvarer, avhenger av hvor mye registeret brukes.
- Tilstedefilene byttes til en ny fil etter 400 skrivinger (omtrent hver time en bruker har registeret åpent), og den gamle slettes.
- Endringer samles i 5 sekunder før de lagres. Alt én bruker gjør i løpet av de 5 sekundene, blir én versjon.
- Skulle en fil likevel ha nådd taket, arkiveres den med en gang, og lagringen går gjennom på en ny fil.

Hvis biblioteket krever utsjekking (det er av som standard), kan ikke appen lagre, og den viser en melding om det.
