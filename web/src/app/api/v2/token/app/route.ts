import { randomUUID } from "node:crypto"

import { addMinutes, isPast } from "date-fns"
import { type JwtPayload, sign, verify } from "jsonwebtoken"
import { type Insertable } from "kysely"
import { type NextRequest } from "next/server"

import { fromDate, nextAuth, readSecretKey } from "@/auth/auth"
import { db } from "@/database/connection"
import { type DB } from "@/database/schema"
import { getUserByUsernameOrEmail } from "@/database/users"

const JWT_ALGORITHM = "HS256"

// 35 years — Leave mobile app logged in basically
// indefinitely
export const maxAge = 35 * 365 * 24 * 60 * 60

export async function createAccessToken(
  data: Record<string, string>,
  expires: Date,
) {
  const payload = {
    ...data,
    exp: expires.valueOf(),
  }

  return sign(payload, await readSecretKey(), { algorithm: JWT_ALGORITHM })
}

const callbackUrl = "storyteller://settings"

export const GET: ReturnType<typeof nextAuth.auth> = await (nextAuth.auth(
  async (request) => {
    if (request.auth) {
      const token = await createAccessToken(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        { sub: request.auth.user.username! },
        addMinutes(new Date(), 5),
      )

      return new Response(null, {
        status: 302,
        headers: { Location: `${callbackUrl}?token=${token}` },
      })
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: `/login?callbackUrl=${encodeURIComponent("/api/v2/token/app")}`,
      },
    })
    // We have to do a cast here because NextAuthResult is
    // typed incorrectly: the `auth` function becmomes async
    // when passed a lazy init function
  },
) as unknown as Promise<ReturnType<typeof nextAuth.auth>>)

export async function POST(request: NextRequest) {
  const unauthorized = new Response(null, { status: 401 })

  const { token } = (await request.json()) as { token: string }

  const payload = verify(token, await readSecretKey(), {
    algorithms: [JWT_ALGORITHM],
    complete: false,
  }) as JwtPayload

  const expiration = payload.exp
  if (!expiration || isPast(expiration)) {
    return unauthorized
  }

  const username = payload.sub
  if (!username) {
    return unauthorized
  }

  const user = await getUserByUsernameOrEmail(username)
  if (!user) {
    return unauthorized
  }

  try {
    const sessionToken = randomUUID()
    const sessionExpiry = fromDate(maxAge)
    const session = {
      sessionToken,
      userId: user.id,
      expires: sessionExpiry,
    }

    await db
      .insertInto("session")
      .values(session as Insertable<DB["session"]>)
      .execute()

    return Response.json({
      access_token: session.sessionToken,
      expires_in: session.expires.valueOf() * 1000 - Date.now(),
      token_type: "bearer",
    })
  } catch {
    return unauthorized
  }
}
