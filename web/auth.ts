import { hash, verify as verifyPassword } from "argon2"

import { Permission, User, getUser, userHasPermission } from "./database/users"
import { add } from "date-fns/fp/add"
import { verify as verifyJwt, sign, JwtPayload } from "jsonwebtoken"
import { NextRequest, NextResponse } from "next/server"
import { isTokenRevoked } from "./database/tokenRevokations"
import { RequestCookie } from "next/dist/compiled/@edge-runtime/cookies"
import { readFileSync } from "node:fs"

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
  username: string,
  password: string,
): Promise<User | null> {
  const user = getUser(username)

  if (!user) return null

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

function extractTokenFromCookie(cookie: RequestCookie | undefined) {
  if (!cookie) return null

  return cookie.value
}

export function extractToken(request: NextRequest) {
  return (
    extractTokenFromHeader(request) ??
    extractTokenFromCookie(request.cookies.get("st_token"))
  )
}

export function withToken<
  Params extends Record<string, unknown> = Record<string, unknown>,
>(
  handler: (
    request: NextRequest,
    context: { params: Params },
    token: string,
  ) => Promise<Response>,
) {
  return async function (request: NextRequest, context: { params: Params }) {
    const token = extractToken(request)
    if (!token) {
      return NextResponse.json(
        { message: "Not authenticated" },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
      )
    }

    return handler(request, context, token)
  }
}

export function verifyToken(token: string) {
  const isRevoked = isTokenRevoked(token)
  if (isRevoked) return null

  try {
    const payload = verifyJwt(token, JWT_SECRET_KEY, {
      algorithms: [JWT_ALGORITHM],
      complete: false,
    }) as JwtPayload

    const username = payload.sub

    if (!username) return null

    return { username }
  } catch (_) {
    return null
  }
}

export function withVerifyToken<
  Params extends Record<string, unknown> = Record<string, unknown>,
>(
  handler: (
    request: NextRequest,
    context: { params: Params },
    token: string,
    tokenData: { username: string },
  ) => Response | Promise<Response>,
) {
  return withToken<Params>(async function (request, context, token) {
    const tokenData = verifyToken(token)
    if (!tokenData) {
      return NextResponse.json(
        {
          message: "Invalid authentication credentials",
        },
        {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer" },
        },
      )
    }

    return handler(request, context, token, tokenData)
  })
}

export function withHasPermission<
  Params extends Record<string, unknown> = Record<string, unknown>,
>(permission: Permission) {
  return function (
    handler: (
      request: NextRequest,
      context: { params: Params },
      token: string,
      tokenData: { username: string },
    ) => Promise<Response> | Response,
  ) {
    return withVerifyToken<Params>(
      async (request, context, token, tokenData) => {
        const hasPermission = userHasPermission(tokenData.username, permission)

        if (!hasPermission) {
          return NextResponse.json({ message: "Forbidden" }, { status: 403 })
        }

        return handler(request, context, token, tokenData)
      },
    )
  }
}

export function hasPermission(
  permission: Permission,
  cookie: RequestCookie | undefined,
) {
  const token = extractTokenFromCookie(cookie)
  if (!token) return false

  const tokenData = verifyToken(token)
  if (!tokenData) return false

  return userHasPermission(tokenData.username, permission)
}
