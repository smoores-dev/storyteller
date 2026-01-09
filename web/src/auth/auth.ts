import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"

import { Auth, createActionURL, raw, skipCSRFCheck } from "@auth/core"
import { hash, verify as verifyPassword } from "argon2"
import { add } from "date-fns/fp/add"
import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers"
import { cookies, headers, headers as nextHeaders } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { type NextRequest, NextResponse } from "next/server"
import NextAuth, {
  type DefaultSession,
  type NextAuthConfig,
  type NextAuthRequest,
  type Session,
} from "next-auth"
import type {
  OAuth2Config,
  OAuthUserConfig,
  OIDCConfig,
} from "next-auth/providers"
import Credentials from "next-auth/providers/credentials"

import { getCookieDomain, getCookieSecure } from "@/cookies"
import { KyselyAdapter } from "@/database/authAdapter"
import { db } from "@/database/connection"
import { getSettings } from "@/database/settings"
import {
  type Permission,
  type UserPermissionSet,
  type UserWithPermissions,
  acceptInvite,
  getCurrentUserSession,
  getInvite,
  getUserByUsernameOrEmail,
  updateUserByEmail,
} from "@/database/users"
import { env } from "@/env"
import type { UUID } from "@/uuid"

import { Providers } from "./providers"

declare module "next-auth" {
  interface Session {
    user: Awaited<ReturnType<typeof getUserByUsernameOrEmail>> &
      DefaultSession["user"]
  }

  interface User {
    username: string | null
    permissions: UserPermissionSet | null
    userPermissionUuid: UUID
  }
}

const JWT_SECRET_KEY_FILE = env.STORYTELLER_SECRET_KEY_FILE
const DEFAULT_SECRET_KEY_FILE = "/run/secrets/secret_key"

/**
 * There was a period of time where Storyteller's example
 * compose.yaml file incorrectly set the STORYTELLER_SECRET_KEY
 * environment variable to the string `/run/secrets/secret_key`,
 * rather than the contents of that file.
 *
 * To mitigate this security risk even for users that don't
 * update their configuration, if that's the value of the env
 * variable, we read the value from the file instead.
 */
export async function readSecretKey() {
  if (JWT_SECRET_KEY_FILE) {
    return await readFile(JWT_SECRET_KEY_FILE, { encoding: "utf-8" })
  }
  if (env.STORYTELLER_SECRET_KEY === DEFAULT_SECRET_KEY_FILE) {
    return await readFile(DEFAULT_SECRET_KEY_FILE, { encoding: "utf-8" })
  }
  // this is mostly a type check
  if (!env.STORYTELLER_SECRET_KEY) {
    throw new Error("STORYTELLER_SECRET_KEY is not set")
  }

  return env.STORYTELLER_SECRET_KEY
}

export function fromDate(time: number, date = Date.now()) {
  return new Date(date + time * 1000)
}

const adapter = KyselyAdapter(db)

// 30 days
export const maxAge = 30 * 24 * 60 * 60

const credentialsProvider = Credentials({
  credentials: {
    usernameOrEmail: {
      type: "text",
      label: "Username or email",
    },
    password: {
      type: "password",
      label: "Password",
      placeholder: "********",
    },
  },
  async authorize(credentials) {
    return authenticateUser(
      credentials.usernameOrEmail as string,
      credentials.password as string,
    )
  },
})

export async function createConfig(
  request: NextRequest | undefined,
): Promise<NextAuthConfig> {
  const settings = await getSettings()

  const additionalProviders = settings.authProviders.map((provider) => {
    if (provider.kind === "built-in") {
      const providerFactory = Providers[provider.id] as (
        config: OAuthUserConfig<unknown>,
      ) => OIDCConfig<unknown>

      return providerFactory({
        clientId: provider.clientId,
        clientSecret: provider.clientSecret,
        ...(provider.issuer && { issuer: provider.issuer }),
      })
    }

    return {
      id: provider.name
        .toLowerCase()
        .replaceAll(/ +/g, "-")
        .replaceAll(/[^a-zA-Z0-9-]/g, ""),
      name: provider.name,
      type: provider.type,
      clientId: provider.clientId,
      clientSecret: provider.clientSecret,
      issuer: provider.issuer,
      ...(provider.type === "oidc" && {
        checks: ["pkce" as const, "state" as const],
      }),
    }
  })

  const providers = [credentialsProvider, ...additionalProviders]

  const authUrlHostname = env.AUTH_URL
    ? new URL(env.AUTH_URL).hostname
    : undefined
  // omit domain for localhost since many http clients handle it poorly
  const sessionCookieDomain =
    authUrlHostname && authUrlHostname !== "localhost"
      ? authUrlHostname
      : undefined

  const config: NextAuthConfig = {
    providers,
    cookies: {
      sessionToken: {
        name: "st_token",
        ...(sessionCookieDomain && {
          options: { domain: sessionCookieDomain },
        }),
      },
    },
    session: {
      maxAge,
    },
    pages: {
      signIn: "/login",
    },
    secret: await readSecretKey(),
    adapter,
    jwt: {
      encode() {
        return ""
      },
      decode() {
        return null
      },
    },
    callbacks: {
      session({ session, user }) {
        return {
          ...session,
          user,
        }
      },
      async signIn({ user, credentials }) {
        if (credentials) {
          const sessionToken = randomUUID()
          const sessionExpiry = fromDate(maxAge)
          await adapter.createSession?.({
            sessionToken,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            userId: user.id!,
            expires: sessionExpiry,
          })
        }
        return true
      },
    },
    basePath: "/api/v2/auth",
    trustHost: true,
  }

  if (!request?.nextUrl.pathname.includes("/auth/callback")) {
    return config
  }

  const cookieJar = await cookies()
  const inviteKeyCookie = cookieJar.get("st_invite")

  if (!inviteKeyCookie) return config

  const invite = await getInvite(inviteKeyCookie.value)
  if (!invite) return config

  await acceptInvite(invite.email, invite.inviteKey)

  await updateUserByEmail(invite.email, { username: invite.email, name: "" })

  return {
    ...config,
    providers: config.providers.map(
      (provider) =>
        ({
          // We never actually pass a function here
          /* eslint-disable-next-line @typescript-eslint/no-misused-spread */
          ...provider,
          allowDangerousEmailAccountLinking: true,
        }) as OAuth2Config<unknown>,
    ),
  }
}

export const nextAuth = NextAuth(createConfig)

export async function createUserToken(
  usernameOrEmail: string,
  password: string,
) {
  const config = await createConfig(undefined)
  const headers = new Headers(await nextHeaders())
  const signInURL = createActionURL(
    "callback",
    // @ts-expect-error `x-forwarded-proto` is not nullable, next.js sets it by default
    headers.get("x-forwarded-proto"),
    headers,
    process.env,
    config,
  )
  const url = `${signInURL.toString()}/credentials`
  headers.set("Content-Type", "application/x-www-form-urlencoded")
  const params = new URLSearchParams({
    usernameOrEmail,
    password,
    callbackUrl: "/",
  })
  const req = new Request(url, { method: "POST", headers, body: params })
  await Auth(req, { ...config, raw, skipCSRFCheck })
  const session = await getCurrentUserSession(usernameOrEmail)

  return {
    access_token: session.sessionToken,
    expires_in: session.expires.valueOf() * 1000 - Date.now(),
    token_type: "bearer",
  }
}

/**
 * AppRouteHandlerFnContext is the context that is passed to the handler as the
 * second argument.
 */
export type AppRouteHandlerFnContext = {
  params: Promise<unknown>
}
/**
 * Handler function for app routes. If a non-Response value is returned, an error
 * will be thrown.
 */
export type AppRouteHandlerFn = (
  /**
   * Incoming request object.
   */
  req: NextRequest,
  /**
   * Context properties on the request (including the parameters if this was a
   * dynamic route).
   */
  ctx: AppRouteHandlerFnContext,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => void | Response | Promise<void | Response>

export const ACCESS_TOKEN_EXPIRE_DAYS = 10

const addAccessTokenExpireDays = add({ days: ACCESS_TOKEN_EXPIRE_DAYS })

export function getAccessTokenExpireDate() {
  return addAccessTokenExpireDays(Date.now())
}

export async function hashPassword(password: string) {
  return await hash(password)
}

export async function authenticateUser(
  usernameOrEmail: string,
  password: string,
) {
  const user = await getUserByUsernameOrEmail(usernameOrEmail)

  if (!user?.hashedPassword) return null

  if (!(await verifyPassword(user.hashedPassword, password))) {
    return null
  }

  return user
}

export function extractTokenFromHeader(h: ReadonlyHeaders) {
  const bearer = h.get("Authorization")
  if (!bearer) return null

  const match = bearer.match(/Bearer (.*)/)
  if (!match) return null

  const authToken = match[1]
  if (!authToken) return null

  return authToken
}

export function parseBasicAuth(
  authHeader: string | null,
): { username: string; password: string } | null {
  if (!authHeader?.startsWith("Basic ")) return null

  const base64 = authHeader.slice(6)
  const decoded = Buffer.from(base64, "base64").toString("utf-8")
  const colonIndex = decoded.indexOf(":")
  if (colonIndex === -1) return null

  return {
    username: decoded.slice(0, colonIndex),
    password: decoded.slice(colonIndex + 1),
  }
}

export function extractBasicAuthFromUrl(
  url: string,
): { username: string; password: string } | null {
  try {
    const parsedUrl = new URL(url)
    const username = parsedUrl.username
    const password = parsedUrl.password

    if (username && password) {
      return {
        username: decodeURIComponent(username),
        password: decodeURIComponent(password),
      }
    }
    return null
  } catch {
    return null
  }
}

// function extractTokenFromCookie(cookie: RequestCookie | undefined) {
//   if (!cookie) return null

//   return cookie.value
// }

export function extractToken(request: NextAuthRequest) {
  return request.auth?.user
}

type VerifiedAuthRequest = NextRequest & { auth: Session }

export function withUser<
  Params extends Promise<Record<string, unknown>> = Promise<
    Record<string, unknown>
  >,
>(
  handler: (
    request: VerifiedAuthRequest,
    context: { params: Promise<Params> },
  ) => Promise<Response> | Response,
): AppRouteHandlerFn {
  return async (request, context) => {
    const token = extractTokenFromHeader(request.headers)
    if (token) {
      request.cookies.set("st_token", token)
    }
    const h = nextAuth.auth(async (request, context) => {
      const user = request.auth?.user
      if (!user) {
        return NextResponse.json(
          { message: "Not authenticated" },
          { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
        )
      }

      return handler(request as VerifiedAuthRequest, context)
      // We have to do a cast here because NextAuthResult is
      // typed incorrectly: the `auth` function becmomes async
      // when passed a lazy init function
    }) as unknown as Promise<ReturnType<typeof nextAuth.auth>>

    return (await h)(request, context)
  }
}

/**
 * @param permission - The permission to check for
 * @param allowBasicAuth - Whether to allow basic auth. Required for many OPDS clients.
 */
export function withHasPermission<
  Params extends Promise<Record<string, unknown>> = Promise<
    Record<string, unknown>
  >,
>(
  permission: Permission,
  options?: {
    allowBasicAuth?: boolean
    on401?: (
      request: NextRequest,
      context: { params: Promise<Params> },
    ) => Promise<Response> | Response
  },
) {
  return (
      handler: (
        request: VerifiedAuthRequest,
        context: { params: Promise<Params> },
      ) => Promise<Response> | Response,
    ): AppRouteHandlerFn =>
    async (request, context) => {
      if (options?.allowBasicAuth) {
        // only allow basic auth if OPDS is enabled
        const settings = await getSettings()
        if (settings.opdsEnabled) {
          // try basic auth from Authorization header first
          let basicCreds = parseBasicAuth(request.headers.get("Authorization"))

          // if not in header, try to extract from URL (some OPDS clients send credentials in URL)
          // not sure if this ever makes its way here tho, most http clients convert this to basic auth
          if (!basicCreds) {
            basicCreds = extractBasicAuthFromUrl(request.url)
          }

          if (basicCreds) {
            const user = await authenticateUser(
              basicCreds.username,
              basicCreds.password,
            )

            if (!user) {
              if (options.on401) {
                return options.on401(
                  request,
                  context as { params: Promise<Params> },
                )
              }
              return NextResponse.json(
                { message: "Not authenticated" },
                { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
              )
            }

            if (!user.permissions?.[permission]) {
              return NextResponse.json(
                { message: "Forbidden" },
                { status: 403 },
              )
            }

            const token = await createUserToken(
              basicCreds.username,
              basicCreds.password,
            )

            // opds clients typically don't send Origin header, fall back to request url
            const origin =
              request.headers.get("Origin") ?? request.nextUrl.origin
            const secure = getCookieSecure(origin)
            const domain = getCookieDomain(origin)

            const cookieStore = await cookies()
            cookieStore.set("st_token", token.access_token, {
              secure,
              // omit domain for localhost since many http clients handle it poorly
              ...(domain && domain !== "localhost" && { domain }),
              sameSite: "lax",
              httpOnly: true,
              expires: new Date(Date.now() + token.expires_in),
            })

            request.cookies.set("st_token", token.access_token)
          }
        }
      }

      const token = extractTokenFromHeader(request.headers)

      if (token) {
        request.cookies.set("st_token", token)
      }
      const h = nextAuth.auth(async (request, context) => {
        if (!request.auth) {
          if (options?.on401) {
            return options.on401(request, context)
          }
          return NextResponse.json(
            { message: "Not authenticated" },
            { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
          )
        }
        const hasPermission = request.auth.user.permissions?.[permission]

        if (!hasPermission) {
          return NextResponse.json({ message: "Forbidden" }, { status: 403 })
        }

        return handler(request as VerifiedAuthRequest, context)
        // We have to do a cast here because NextAuthResult is
        // typed incorrectly: the `auth` function becmomes async
        // when passed a lazy init function
      }) as unknown as Promise<ReturnType<typeof nextAuth.auth>>

      return (await h)(request, context)
    }
}

export function hasPermission(
  permission: Permission,
  user: Session["user"] | undefined,
) {
  return !!user?.permissions?.[permission]
}

export async function assertHasPermission(permission: Permission) {
  const cookieStore = await cookies()
  const authTokenCookie = cookieStore.get("st_token")

  const authTokenHeader = extractTokenFromHeader(await headers())

  const authToken = authTokenCookie?.value ?? authTokenHeader

  if (!authToken) {
    redirect("/login")
  }

  const sessionAndUser = await adapter.getSessionAndUser?.(authToken)

  if (!sessionAndUser) {
    redirect("/login")
  }

  const user = sessionAndUser.user as UserWithPermissions

  if (!user.permissions?.[permission]) {
    notFound()
  }

  return user
}
