import { sql } from "kysely"

import { db } from "@/database/connection"
import {
  type AuthProvider,
  ENCRYPTED_SETTING_KEYS,
} from "@/database/settingsTypes"
import { logger } from "@/logging"
import { encryptSecret, isEncrypted } from "@/secrets"

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

async function encryptSettingRows() {
  const { rows } = await sql<{ name: string; value: string }>`
    SELECT name, value FROM settings
  `.execute(db)

  let encrypted = 0

  for (const row of rows) {
    if (
      !ENCRYPTED_SETTING_KEYS.includes(
        row.name as (typeof ENCRYPTED_SETTING_KEYS)[number],
      )
    ) {
      continue
    }

    const parsed = safeParse(row.value)
    if (typeof parsed !== "string" || !parsed || isEncrypted(parsed)) continue

    const value = JSON.stringify(await encryptSecret(parsed))
    await sql`UPDATE settings SET value = ${value} WHERE name = ${row.name}`.execute(
      db,
    )
    encrypted += 1
  }

  return encrypted
}

async function encryptAuthProviderSecrets() {
  const { rows } = await sql<{ value: string }>`
    SELECT value FROM settings WHERE name = 'authProviders'
  `.execute(db)

  const raw = rows[0]?.value
  if (!raw) return 0

  const providers = safeParse(raw) as AuthProvider[] | null
  if (!Array.isArray(providers) || providers.length === 0) return 0

  let encrypted = 0

  const updated = await Promise.all(
    providers.map(async (provider) => {
      if (!provider.clientSecret || isEncrypted(provider.clientSecret)) {
        return provider
      }
      encrypted += 1
      return {
        ...provider,
        clientSecret: await encryptSecret(provider.clientSecret),
      }
    }),
  )

  if (encrypted === 0) return 0

  const value = JSON.stringify(updated)
  await sql`UPDATE settings SET value = ${value} WHERE name = 'authProviders'`.execute(
    db,
  )

  return encrypted
}

async function encryptServerPrivateKey() {
  const { rows } = await sql<{ privateKey: string }>`
    SELECT private_key AS privateKey FROM server_identity WHERE id = 1
  `.execute(db)

  const privateKey = rows[0]?.privateKey
  if (!privateKey || isEncrypted(privateKey)) return 0

  const value = await encryptSecret(privateKey)
  await sql`UPDATE server_identity SET private_key = ${value} WHERE id = 1`.execute(
    db,
  )

  return 1
}

export default async function migrate() {
  const total =
    (await encryptSettingRows()) +
    (await encryptAuthProviderSecrets()) +
    (await encryptServerPrivateKey())

  if (total > 0) {
    logger.info(
      `Encrypted ${total} stored secrets at rest. They are protected by STORYTELLER_SECRET_KEY, so changing that value makes them unreadable and they will need to be re-entered.`,
    )
  }
}
