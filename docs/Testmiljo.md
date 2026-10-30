# Eget testmiljø i SharePoint

Slik setter du opp en egen Microsoft 365-tenant med SharePoint for å teste appen, uten å involvere IT i organisasjonen. Alt her gjøres i en tenant du selv eier, helt adskilt fra jobbkontoen.

## 1. Lag en egen tenant (Business Basic, prøveperiode)

En konto i en organisasjon der du ikke er administrator (du får «doesn't have permission» i admin.microsoft.com), kan ikke brukes. Lag en ny tenant der du selv er global administrator:

1. Gå til <https://www.microsoft.com/microsoft-365/business/microsoft-365-business-basic> og velg **Prøv gratis** (en måned gratis, deretter rundt 70 kr per bruker per måned, kan sies opp før prøveperioden er over).
2. Oppgi en **privat** e-postadresse. Når du blir spurt om konto, lag en **ny**: velg et domenenavn, f.eks. `riskregtest`, og et brukernavn, f.eks. `magnus@riskregtest.onmicrosoft.com`.
3. Du må oppgi betalingskort. Slå av automatisk fornyelse i admin.microsoft.com › Fakturering hvis du ikke vil fortsette etter prøveperioden.

Logg alltid inn med den nye kontoen (`…@riskregtest.onmicrosoft.com`) når du tester. Bruk gjerne et eget nettleserprofil eller et privat vindu, så den ikke blandes med jobbkontoen.

> Microsoft 365 Developer Program gir en gratis sandkasse, men gis nå nesten bare til de som har et Visual Studio-abonnement. Har du det, kan du bruke den i stedet.

## 2. Lag et SharePoint-område

1. Gå til `https://riskregtest.sharepoint.com` (bytt ut med ditt domenenavn) og velg **+ Opprett område** › **Teamområde**.
2. Gi det et navn, f.eks. «Prosjekt Test 1». Adressen blir `https://riskregtest.sharepoint.com/sites/ProsjektTest1`.
3. Lag gjerne ett område til, så du kan teste at hvert område har sitt eget register.

## 3. Registrer appen i Entra ID

1. Gå til <https://entra.microsoft.com> › **Applikasjoner** › **Appregistreringer** › **Ny registrering**.
   - Navn: `Riskregister test`
   - Kontotyper som støttes: *Bare kontoer i denne organisasjonskatalogen*
   - Omdirigerings-URI: plattform **Enkeltsideapplikasjon (SPA)**, adresse `https://dooniem.github.io/riskregister-web/`
2. Under **Godkjenning** › **Legg til URI**: legg også inn `http://localhost:5173/` for testing på egen maskin.
3. Under **API-tillatelser** › **Legg til en tillatelse** › **Microsoft Graph** › **Delegerte tillatelser**: velg `Sites.Manage.All` og `User.ReadBasic.All` (søk etter personer når du velger risikoeier, tiltakseier og deltakere). `User.Read` ligger der fra før.
4. Trykk **Gi administratorsamtykke for …** (du er administrator i din egen tenant).
5. Kopier **Program-ID (klient)** og **Katalog-ID (leier)** fra **Oversikt**.

Ingen klienthemmelighet trengs. Appen bruker bare den innloggede brukerens egen tilgang.

## 4. Koble appen til

1. Åpne appen (`https://dooniem.github.io/riskregister-web/`), og velg **Tilkoblingsinnstillinger** på startsiden.
2. Lim inn klient-ID og leier-ID, la **Sites.Manage.All** være valgt, og trykk **Lagre og last på nytt**. Innstillingene lagres bare i denne nettleseren.
3. **Logg inn med Microsoft** med testkontoen.
4. Velg **Sett opp riskregister på et område**, og lim inn adressen til området fra steg 2. Appen lager listene (se under), og gir deg en lenke som åpner registeret direkte.

Lenken kan legges i navigasjonen på området (Rediger › + under menyen på venstre side), så alle på området finner registeret.

Alternativt kan klient-ID og leier-ID bygges inn i appen på GitHub Pages: Settings › Secrets and variables › Actions › Variables, med `AZURE_CLIENT_ID` og `AZURE_TENANT_ID`. Da slipper testbrukere å fylle dem inn. Innstillinger i nettleseren overstyrer alltid det som er bygget inn.

## 5. Se rådataene

- I appen: **Mer › Vis rådata (listene)** viser radene i hver liste.
- I SharePoint: tannhjulet › **Områdeinnhold**. Listene heter «Riskregister Risker», «Riskregister Tiltak» osv. Endrer du noe der, ser appen det i løpet av noen sekunder.
- Med Graph Explorer (<https://aka.ms/ge>), logget inn med testkontoen: `GET https://graph.microsoft.com/v1.0/sites/riskregtest.sharepoint.com:/sites/ProsjektTest1:/lists`.

## 6. Flere brukere

For å teste samtidig redigering trenger du flere brukere:

- **Gjester (gratis):** På området, **Del området** / **Medlemmer** › legg til en privat e-postadresse. Gjesten får en invitasjon og logger inn med sin egen Microsoft-konto. Gjester kan bruke appen så lenge de logger inn mot din tenant, som appen gjør automatisk.
- **Ekstra brukere i tenanten:** admin.microsoft.com › Brukere › Legg til bruker. Hver bruker trenger en lisens for SharePoint (koster per bruker etter prøveperioden).
- **Raskest:** samme bruker i to nettleserfaner.

Gjester og brukere i tenanten dukker opp når du søker etter risikoeier, tiltakseier eller deltakere (Prosjekt og deltakere › Deltakere › Legg til fra organisasjonen). Har du lagt inn `User.ReadBasic.All` etter at du logget inn første gang, ber appen om samtykke i et popupvindu første gang du søker. Appen viser det som to økter, men med samme navn.

## 7. Når organisasjonen skal ta over

Ingenting i appen er knyttet til testtenanten. IT lager en tilsvarende appregistrering i organisasjonens Entra ID (se [IT-oppsett.md](IT-oppsett.md)), og klient-ID og leier-ID legges inn ved bygging eller i `config.json`. Registrene lages på nytt på prosjektenes områder, eller flyttes med eksport til Excel og import.
