import { hash, verify as verifyPassword } from "argon2"

import {
  Permission,
  UserPermissionSet,
  acceptInvite,
  getInvite,
  getUserByUsernameOrEmail,
  updateUserByEmail,
} from "../database/users"
import { add } from "date-fns/fp/add"
import { sign } from "jsonwebtoken"
import { NextRequest, NextResponse } from "next/server"
import { readFileSync } from "node:fs"
import NextAuth, { type DefaultSession, NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { KyselyAdapter } from "../database/authAdapter"
import { db } from "../database/connection"
import { Session, NextAuthRequest } from "next-auth"
import { OAuth2Config, OAuthUserConfig, OIDCConfig } from "next-auth/providers"
import { UUID } from "../uuid"
import { randomUUID } from "node:crypto"
import { getSettings } from "../database/settings"
import { Providers } from "./providers"
import { cookies } from "next/headers"

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

function fromDate(time: number, date = Date.now()) {
  return new Date(date + time * 1000)
}

const adapter = KyselyAdapter(db)

// 30 days
const maxAge = 30 * 24 * 60 * 60

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

export const config: NextAuthConfig = {
  providers: [credentialsProvider],
  cookies: {
    sessionToken: { name: "st_token" },
  },
  session: {
    maxAge,
  },
  pages: {
    signIn: "/login",
  },
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  secret: process.env["AUTH_SECRET"]!,
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
}

async function syncProviders() {
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

  config.providers = [credentialsProvider, ...additionalProviders]
}

await syncProviders()

async function createConfig(request: NextRequest | undefined) {
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
          ...provider,
          allowDangerousEmailAccountLinking: true,
        }) as OAuth2Config<unknown>,
    ),
  }
}

export let nextAuth = NextAuth(createConfig)

export async function refreshNextAuth() {
  await syncProviders()
  nextAuth = NextAuth(createConfig)
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

const JWT_SECRET_KEY_FILE = process.env["STORYTELLER_SECRET_KEY_FILE"]
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
function readSecretKey() {
  if (JWT_SECRET_KEY_FILE) {
    return readFileSync(JWT_SECRET_KEY_FILE, { encoding: "utf-8" })
  }
  if (process.env["STORYTELLER_SECRET_KEY"] === DEFAULT_SECRET_KEY_FILE) {
    return readFileSync(DEFAULT_SECRET_KEY_FILE, { encoding: "utf-8" })
  }
  return process.env["STORYTELLER_SECRET_KEY"] ?? "<notsosecret>"
}

const JWT_SECRET_KEY = readSecretKey()
const JWT_ALGORITHM = "HS256"
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

export function createAccessToken(data: Record<string, string>, expires: Date) {
  const payload = {
    ...data,
    exp: expires.valueOf(),
  }

  return sign(payload, JWT_SECRET_KEY, { algorithm: JWT_ALGORITHM })
}

function extractTokenFromHeader(request: NextRequest) {
  const bearer = request.headers.get("Authorization")
  if (!bearer) return null

  const match = bearer.match(/Bearer (.*)/)
  if (!match) return null

  const authToken = match[1]
  if (!authToken) return null

  return authToken
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
  return async function (request, context) {
    const token = extractTokenFromHeader(request)
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

export function withHasPermission<
  Params extends Promise<Record<string, unknown>> = Promise<
    Record<string, unknown>
  >,
>(permission: Permission) {
  return function (
    handler: (
      request: VerifiedAuthRequest,
      context: { params: Promise<Params> },
    ) => Promise<Response> | Response,
  ): AppRouteHandlerFn {
    return async function (request, context) {
      const token = extractTokenFromHeader(request)
      if (token) {
        request.cookies.set("st_token", token)
      }
      const h = nextAuth.auth(async (request, context) => {
        if (!request.auth) {
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
}

export function hasPermission(
  permission: Permission,
  user: Session["user"] | undefined,
) {
  return !!user?.permissions?.[permission]
}
