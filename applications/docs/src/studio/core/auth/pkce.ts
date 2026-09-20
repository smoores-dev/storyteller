export interface TokenSet {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
}

interface PendingSignIn {
  verifier: string
  state: string
  returnTo: string
}

interface AuthConfig {
  baseUrl: string
  appId: string
  redirectUri: string
}

const PENDING_KEY = "studio:pkce"

function storageKey(baseUrl: string) {
  return `studio:auth:${baseUrl}`
}

function randomString(bytes: number): string {
  const array = new Uint8Array(bytes)
  crypto.getRandomValues(array)
  return base64Url(array)
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ""
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  )
  return base64Url(digest)
}

export function loadTokens(baseUrl: string): TokenSet | null {
  try {
    const raw = localStorage.getItem(storageKey(baseUrl))
    if (!raw) return null
    const parsed = JSON.parse(raw) as TokenSet
    if (typeof parsed.accessToken !== "string") return null
    return parsed
  } catch {
    return null
  }
}

export function saveTokens(baseUrl: string, tokens: TokenSet | null) {
  if (tokens) {
    localStorage.setItem(storageKey(baseUrl), JSON.stringify(tokens))
  } else {
    localStorage.removeItem(storageKey(baseUrl))
  }
}

export async function beginSignIn(config: AuthConfig, returnTo: string) {
  const verifier = randomString(48)
  const state = randomString(16)
  const pending: PendingSignIn = { verifier, state, returnTo }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
    scope: "api",
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "S256",
  })
  window.location.assign(`${config.baseUrl}/oauth/authorize?${params}`)
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  created_at?: number
  error?: string
  error_description?: string
}

async function requestToken(
  baseUrl: string,
  body: Record<string, string>,
): Promise<TokenSet> {
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  })
  const json = (await response.json()) as TokenResponse
  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description ?? json.error ?? `token request failed`,
    )
  }
  const expiresIn = json.expires_in ?? 7200
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: Date.now() + expiresIn * 1000,
  }
}

export interface SignInResult {
  tokens: TokenSet
  returnTo: string
}

export async function completeSignIn(
  config: AuthConfig,
  url: URL,
): Promise<SignInResult | null> {
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  if (!code || !state) return null
  const rawPending = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  if (!rawPending) throw new Error("sign-in session expired, try again")
  const pending = JSON.parse(rawPending) as PendingSignIn
  if (pending.state !== state) throw new Error("sign-in state mismatch")
  const tokens = await requestToken(config.baseUrl, {
    client_id: config.appId,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code_verifier: pending.verifier,
  })
  saveTokens(config.baseUrl, tokens)
  return { tokens, returnTo: pending.returnTo }
}

export async function refreshTokens(
  config: AuthConfig,
  tokens: TokenSet,
): Promise<TokenSet> {
  if (!tokens.refreshToken) throw new Error("no refresh token")
  const next = await requestToken(config.baseUrl, {
    client_id: config.appId,
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    redirect_uri: config.redirectUri,
  })
  saveTokens(config.baseUrl, next)
  return next
}

export function signOut(baseUrl: string) {
  saveTokens(baseUrl, null)
}

export class AuthSession {
  private tokens: TokenSet | null
  private refreshing: Promise<TokenSet> | null = null
  private listeners = new Set<() => void>()

  constructor(private readonly config: AuthConfig | null) {
    this.tokens = config ? loadTokens(config.baseUrl) : null
  }

  get isSignedIn() {
    return this.tokens !== null
  }

  get canSignIn() {
    return this.config !== null
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  setTokens(tokens: TokenSet | null) {
    this.tokens = tokens
    if (this.config) saveTokens(this.config.baseUrl, tokens)
    this.notify()
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.tokens || !this.config) return null
    if (this.tokens.expiresAt - Date.now() > 60_000) {
      return this.tokens.accessToken
    }
    return (await this.forceRefresh()).accessToken
  }

  async forceRefresh(): Promise<TokenSet> {
    if (!this.tokens || !this.config) throw new Error("not signed in")
    if (this.refreshing === null) {
      this.refreshing = refreshTokens(this.config, this.tokens)
        .then((next) => {
          this.tokens = next
          this.notify()
          return next
        })
        .catch((error: unknown) => {
          this.setTokens(null)
          throw error
        })
        .finally(() => {
          this.refreshing = null
        })
    }
    return this.refreshing
  }

  signIn(returnTo: string) {
    if (!this.config) throw new Error("sign-in is not configured")
    return beginSignIn(this.config, returnTo)
  }

  async completeSignIn(url: URL): Promise<string | null> {
    if (!this.config) return null
    const result = await completeSignIn(this.config, url)
    if (!result) return null
    this.setTokens(result.tokens)
    return result.returnTo
  }

  signOut() {
    this.setTokens(null)
  }
}
