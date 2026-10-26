// Microsoft-innlogging (Entra ID) med MSAL. Appen har ingen egne brukere eller passord:
// den henter et token for den innloggede brukeren og får bare tilgang til det brukeren har tilgang til i SharePoint.
import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'

export interface AuthConfig {
  clientId: string
  tenantId: string
}

export const SCOPES = ['Files.ReadWrite.All', 'User.Read']
const CONFIG_KEY = 'rr-auth-config'
const RETUR_KEY = 'rr-retur-url'

let pca: PublicClientApplication | null = null
let konto: AccountInfo | null = null

export async function hentConfig(): Promise<AuthConfig | null> {
  try {
    const lokal = localStorage.getItem(CONFIG_KEY)
    if (lokal) {
      const c = JSON.parse(lokal) as AuthConfig
      if (c.clientId && c.tenantId) return c
    }
  } catch {
    /* ignorer */
  }
  const env = { clientId: import.meta.env.VITE_AZURE_CLIENT_ID ?? '', tenantId: import.meta.env.VITE_AZURE_TENANT_ID ?? '' }
  if (env.clientId && env.tenantId) return env
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'config.json', { cache: 'no-store' })
    if (r.ok) {
      const c = (await r.json()) as AuthConfig
      if (c.clientId && c.tenantId) return c
    }
  } catch {
    /* ignorer */
  }
  return null
}

export function lagreConfig(c: AuthConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
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
  await pca.loginRedirect({ scopes: SCOPES, prompt: 'select_account' })
}

export async function loggUt() {
  if (!pca) return
  await pca.logoutRedirect({ account: konto ?? undefined, postLogoutRedirectUri: redirectUri() })
}

export async function token(): Promise<string> {
  if (!pca || !konto) throw new Error('Ikke logget inn')
  try {
    const r = await pca.acquireTokenSilent({ scopes: SCOPES, account: konto })
    return r.accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      sessionStorage.setItem(RETUR_KEY, window.location.href)
      await pca.acquireTokenRedirect({ scopes: SCOPES, account: konto })
    }
    throw e
  }
}
