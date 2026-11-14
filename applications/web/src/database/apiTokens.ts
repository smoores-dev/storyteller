import { createHash, randomBytes } from "node:crypto"

import { addDays } from "date-fns"

import { type ApiTokenExpiration } from "@/database/apiTokenTypes"
import { db } from "@/database/connection"
import {
  type Permission,
  type UserWithPermissions,
  getUser,
} from "@/database/users"
import { toIsoDateTimeString } from "@/dates"
import { type UUID } from "@/uuid"

const TOKEN_PREFIX = "st_"
const TOKEN_START_LENGTH = TOKEN_PREFIX.length + 4
const LAST_USED_RESOLUTION_MS = 60_000

export const READING_SCOPE: Permission[] = ["bookRead"]

const EXPIRATION_DAYS: Record<ApiTokenExpiration, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
  never: null,
}

export type ApiTokenExpiry =
  | { expiresAt: Date | null }
  | { idleTimeoutDays: number }

export type ApiTokenUser = {
  user: UserWithPermissions
  scope: Permission[] | null
}

export function isApiToken(value: string) {
  return value.startsWith(TOKEN_PREFIX)
}

export function apiTokenExpiresAt(
  expiration: ApiTokenExpiration,
  now = new Date(),
) {
  const days = EXPIRATION_DAYS[expiration]
  return days === null ? null : addDays(now, days)
}

function isExpired(expiresAt: Date | null) {
  return !!expiresAt && expiresAt.valueOf() <= Date.now()
}

function initialExpiry(expiry: ApiTokenExpiry) {
  return "idleTimeoutDays" in expiry
    ? {
        expiresAt: addDays(new Date(), expiry.idleTimeoutDays),
        idleTimeoutDays: expiry.idleTimeoutDays,
      }
    : { expiresAt: expiry.expiresAt, idleTimeoutDays: null }
}

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex")
}

/**
 * As a preperation for possible Kosync integration
 */
function hashToken(token: string) {
  return hashKey(createHash("md5").update(token).digest("hex"))
}

export function scopePermissions(
  permissions: UserWithPermissions["permissions"],
  scope: Permission[],
) {
  return Object.fromEntries(
    Object.entries(permissions).map(([permission, granted]) => [
      permission,
      granted && scope.includes(permission as Permission),
    ]),
  ) as UserWithPermissions["permissions"]
}

export async function createApiToken(
  userId: UUID,
  name: string,
  scope: Permission[] | null,
  expiry: ApiTokenExpiry = { expiresAt: null },
) {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`

  await db
    .insertInto("apiToken")
    .values({
      userId,
      name,
      tokenHash: hashToken(token),
      tokenStart: token.slice(0, TOKEN_START_LENGTH),
      scope: scope && JSON.stringify(scope),
      ...initialExpiry(expiry),
    })
    .execute()

  return token
}

export async function getApiTokens(userId: UUID) {
  const rows = await db
    .selectFrom("apiToken")
    .select([
      "uuid",
      "name",
      "tokenStart",
      "scope",
      "lastUsedAt",
      "expiresAt",
      "idleTimeoutDays",
      "createdAt",
    ])
    .where("userId", "=", userId)
    .orderBy("createdAt", "desc")
    .execute()

  return rows.map((row) => ({
    ...row,
    createdAt: toIsoDateTimeString(row.createdAt),
    lastUsedAt: toIsoDateTimeString(row.lastUsedAt),
    expiresAt: toIsoDateTimeString(row.expiresAt),
  }))
}

export type ApiTokenSummary = Awaited<ReturnType<typeof getApiTokens>>[number]

export async function deleteApiToken(userId: UUID, uuid: UUID) {
  const result = await db
    .deleteFrom("apiToken")
    .where("userId", "=", userId)
    .where("uuid", "=", uuid)
    .executeTakeFirst()

  return result.numDeletedRows > 0n
}

export async function getApiTokenUser(
  token: string,
): Promise<ApiTokenUser | null> {
  const row = await db
    .selectFrom("apiToken")
    .select([
      "uuid",
      "userId",
      "scope",
      "lastUsedAt",
      "expiresAt",
      "idleTimeoutDays",
    ])
    .where("tokenHash", "=", hashToken(token))
    .executeTakeFirst()

  if (!row || isExpired(row.expiresAt)) {
    return null
  }

  const user = await getUser(row.userId)
  if (!user) {
    return null
  }

  if (
    !row.lastUsedAt ||
    Date.now() - row.lastUsedAt.valueOf() > LAST_USED_RESOLUTION_MS
  ) {
    const now = new Date()
    await db
      .updateTable("apiToken")
      .set({
        lastUsedAt: now,
        ...(row.idleTimeoutDays !== null && {
          expiresAt: addDays(now, row.idleTimeoutDays),
        }),
      })
      .where("uuid", "=", row.uuid)
      .execute()
  }

  return {
    user: row.scope
      ? { ...user, permissions: scopePermissions(user.permissions, row.scope) }
      : user,
    scope: row.scope,
  }
}
