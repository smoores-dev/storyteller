import { randomBytes } from "node:crypto"

import { addMinutes } from "date-fns"
import { type Insertable, type Updateable } from "kysely"

import { db } from "@/database/connection"
import { type DB, type DeviceAuthorization } from "@/database/schema"
import type { UUID } from "@/uuid"

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export const DEVICE_AUTH_INTERVAL_SECONDS = 5
export const DEVICE_AUTH_EXPIRES_IN_SECONDS = 15 * 60
type DeviceAuthorizationUpdate = Partial<
  Pick<
    Updateable<DB["deviceAuthorization"]>,
    "approvedByUserId" | "lastPolledAt" | "status"
  >
>

function randomString(length: number) {
  const bytes = randomBytes(length)
  return Array.from(
    bytes,
    (byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length],
  ).join("")
}

function createDeviceCode() {
  return randomBytes(24).toString("base64url")
}

function createUserCode() {
  const raw = randomString(8)
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

async function generateUniqueCode<T>(
  generator: () => string,
  exists: (value: string) => Promise<T | undefined>,
) {
  for (;;) {
    const value = generator()
    const existing = await exists(value)
    if (existing === undefined) {
      return value
    }
  }
}

export async function createDeviceAuthorization() {
  const deviceCode = await generateUniqueCode(
    createDeviceCode,
    async (value) => {
      return await db
        .selectFrom("deviceAuthorization")
        .select("id")
        .where("deviceCode", "=", value)
        .executeTakeFirst()
    },
  )

  const userCode = await generateUniqueCode(createUserCode, async (value) => {
    return await db
      .selectFrom("deviceAuthorization")
      .select("id")
      .where("userCode", "=", value)
      .executeTakeFirst()
  })

  const expiresAt = addMinutes(new Date(), DEVICE_AUTH_EXPIRES_IN_SECONDS / 60)

  await db
    .insertInto("deviceAuthorization")
    .values({
      deviceCode,
      userCode,
      expiresAt,
      intervalSeconds: DEVICE_AUTH_INTERVAL_SECONDS,
      status: "pending",
    } as Insertable<DB["deviceAuthorization"]>)
    .execute()

  return await getDeviceAuthorizationByDeviceCodeOrThrow(deviceCode)
}

export async function getDeviceAuthorizationByDeviceCode(deviceCode: string) {
  return await db
    .selectFrom("deviceAuthorization")
    .selectAll()
    .where("deviceCode", "=", deviceCode)
    .executeTakeFirst()
}

export async function getDeviceAuthorizationByDeviceCodeOrThrow(
  deviceCode: string,
) {
  return await db
    .selectFrom("deviceAuthorization")
    .selectAll()
    .where("deviceCode", "=", deviceCode)
    .executeTakeFirstOrThrow()
}

export async function getDeviceAuthorizationByUserCode(userCode: string) {
  return await db
    .selectFrom("deviceAuthorization")
    .selectAll()
    .where("userCode", "=", normalizeUserCode(userCode))
    .executeTakeFirst()
}

export async function updateDeviceAuthorization(
  id: UUID,
  values: DeviceAuthorizationUpdate,
) {
  await db
    .updateTable("deviceAuthorization")
    .set(values)
    .where("id", "=", id)
    .execute()
}

export async function approveDeviceAuthorization(id: UUID, userId: UUID) {
  await updateDeviceAuthorization(id, {
    approvedByUserId: userId,
    status: "approved",
  })
}

export async function denyDeviceAuthorization(id: UUID) {
  await updateDeviceAuthorization(id, {
    approvedByUserId: null,
    status: "denied",
  })
}

export async function consumeDeviceAuthorization(id: UUID) {
  await updateDeviceAuthorization(id, {
    status: "consumed",
  })
}

export function normalizeUserCode(userCode: string) {
  return userCode.trim().toUpperCase()
}

export function isExpiredDeviceAuthorization(
  deviceAuthorization: Pick<DeviceAuthorization, "expiresAt">,
) {
  return deviceAuthorization.expiresAt.valueOf() <= Date.now()
}

export function isDeviceAuthorizationPending(status: unknown) {
  return String(status) === "pending"
}

export function isDeviceAuthorizationApproved(status: unknown) {
  return String(status) === "approved"
}
