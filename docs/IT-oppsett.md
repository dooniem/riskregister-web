# Oppsett hos IT

Appen trenger én appregistrering i Entra ID. Den har ingen egen server, database eller hemmeligheter.

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

`Sites.Selected` er mulig, men krever at IT gir tilgang per prosjektområde, og da faller selvbetjeningen bort.

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
| Lagre `register.json` (`PUT` med `If-Match`) | ved hver endring |

Det gir rundt 1–2 kall i sekundet per bruker, og 10–20 i sekundet med 10 brukere i samme register. Appen respekterer `Retry-After` ved struping (429/503). Intervallene kan økes ved behov.

## Filer appen lager i prosjektmappen

```
Riskregister/
  register.json            selve registeret
  Åpne Riskregister.url    snarvei som åpner appen med dette registeret
  _tilstede/<bruker-id>.json   hvem som er inne nå (slettes når brukeren lukker)
```
