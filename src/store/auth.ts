// Microsoft-innlogging (Entra ID) med MSAL. Appen har ingen egne brukere eller passord:
// den henter et token for den innloggede brukeren og får bare tilgang til det brukeren har tilgang til i SharePoint.
import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'

// Hvilken Graph-tillatelse appen ber om ved innlogging. Må stemme med det som er lagt inn i appregistreringen.
// manage: Sites.Manage.All, appen når listene på alle områder brukeren selv har tilgang til, og kan lage listene
//         for et nytt register (standard).
// sites: Sites.Selected, appen når bare SharePoint-områdene IT har gitt den tilgang til. Tenkt for en pilot.
// Innstillingen er midlertidig, til vi vet hva IT velger.
export type Tillatelse = 'manage' | 'sites'

// Hvor tilkoblingen er hentet fra: lagt inn i denne nettleseren (testing), bygget inn i appen, eller config.json
export type ConfigKilde = 'nettleser' | 'bygg' | 'fil'

export interface AuthConfig {
  clientId: string
  tenantId: string
  tillatelse?: Tillatelse
  kilde?: ConfigKilde
}

const SCOPE: Record<Tillatelse, string> = { manage: 'Sites.Manage.All', sites: 'Sites.Selected' }
let scopes = [SCOPE.manage, 'User.Read']

// Eldre innstillinger kan ha «files» (Files.ReadWrite.All), som ikke gir tilgang til lister
const tillatelse = (t?: string): Tillatelse => (t === 'sites' ? 'sites' : 'manage')
const CONFIG_KEY = 'rr-auth-config'
const RETUR_KEY = 'rr-retur-url'

let pca: PublicClientApplication | null = null
let konto: AccountInfo | null = null

export async function hentConfig(): Promise<AuthConfig | null> {
  try {
    const lokal = localStorage.getItem(CONFIG_KEY)
    if (lokal) {
      const c = JSON.parse(lokal) as AuthConfig
      if (c.clientId && c.tenantId) return { ...c, tillatelse: tillatelse(c.tillatelse), kilde: 'nettleser' }
    }
  } catch {
    /* ignorer */
  }
  const env: AuthConfig = {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID ?? '',
    tenantId: import.meta.env.VITE_AZURE_TENANT_ID ?? '',
    tillatelse: tillatelse(import.meta.env.VITE_AZURE_TILLATELSE),
    kilde: 'bygg',
  }
  if (env.clientId && env.tenantId) return env
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'config.json', { cache: 'no-store' })
    if (r.ok) {
      const c = (await r.json()) as AuthConfig
      if (c.clientId && c.tenantId) return { ...c, tillatelse: tillatelse(c.tillatelse), kilde: 'fil' }
    }
  } catch {
    /* ignorer */
  }
  return null
}

export function lagreConfig(c: AuthConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify({ clientId: c.clientId, tenantId: c.tenantId, tillatelse: c.tillatelse }))
    else localStorage.removeItem(CONFIG_KEY)
  } catch {
    /* ignorer */
  }
}

// Adressen appen ligger på (uten søkeparametre). Brukes som omdirigerings-URI og i lenker til registre.
export function appUrl() {
  return window.location.origin + window.location.pathname.replace(/index\.html$/, '')
}

export function redirectUri() {
  return appUrl()
}

// Kalles ved oppstart. Fullfører en innlogging som kom tilbake fra Microsoft.
export async function initAuth(c: AuthConfig): Promise<AccountInfo | null> {
  scopes = [SCOPE[tillatelse(c.tillatelse)], 'User.Read']
  pca = new PublicClientApplication({
    auth: {
      clientId: c.clientId,
      authority: `https://login.microsoftonline.com/${c.tenantId}`,
      redirectUri: redirectUri(),
      navigateToLoginRequestUrl: false,
    },
    cache: { cacheLocation: 'localStorage' },
  })
  await pca.initialize()
  const svar = await pca.handleRedirectPromise()
  if (svar?.account) {
    konto = svar.account
    const retur = sessionStorage.getItem(RETUR_KEY)
    sessionStorage.removeItem(RETUR_KEY)
    if (retur && retur !== window.location.href) window.history.replaceState(null, '', retur)
  } else {
    konto = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null
  }
  if (konto) pca.setActiveAccount(konto)
  return konto
}

export function aktivKonto() {
  return konto
}

export async function loggInn() {
  if (!pca) throw new Error('Innlogging er ikke konfigurert')
  sessionStorage.setItem(RETUR_KEY, window.location.href)
  await pca.loginRedirect({ scopes, prompt: 'select_account' })
}

export async function loggUt() {
  if (!pca) return
  await pca.logoutRedirect({ account: konto ?? undefined, postLogoutRedirectUri: redirectUri() })
}

export async function token(): Promise<string> {
  if (!pca || !konto) throw new Error('Ikke logget inn')
  try {
    const r = await pca.acquireTokenSilent({ scopes, account: konto })
    return r.accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      sessionStorage.setItem(RETUR_KEY, window.location.href)
      await pca.acquireTokenRedirect({ scopes, account: konto })
    }
    throw e
  }
}

export class TrengerSamtykke extends Error {}

// Token for en tillatelse appen ber om først når den trengs (f.eks. User.ReadBasic.All for søk i organisasjonen).
// Slik stopper ikke innloggingen hvis tillatelsen ikke er godkjent. Mangler samtykke, kastes TrengerSamtykke,
// og brukeren kan gi det med et klikk (popupvindu, som må åpnes fra et klikk for ikke å bli blokkert).
export async function tokenFor(ekstra: string[], interaktiv = false): Promise<string> {
  if (!pca || !konto) throw new Error('Ikke logget inn')
  if (interaktiv) return (await pca.acquireTokenPopup({ scopes: ekstra, account: konto })).accessToken
  try {
    return (await pca.acquireTokenSilent({ scopes: ekstra, account: konto })).accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) throw new TrengerSamtykke('Appen trenger samtykke for å søke i organisasjonen.')
    throw e
  }
}
