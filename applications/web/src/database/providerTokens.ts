import { env } from "@/env"
import { type MatchConfidence } from "@/metadata/match"
import { encryptSecret } from "@/secrets"

import { db } from "./connection"
import { getConfigLockedKeys, getSetting } from "./settings"

export type ProviderTokenSource = "config" | "database" | "env"

export type ProviderTokenStatus = {
  tokenSet: boolean
  source: ProviderTokenSource | null
  locked: boolean
  unreadable: boolean
}

export type MetadataProvidersResponse = {
  available: boolean
  hardcover: ProviderTokenStatus
  thresholds: { audnexus: MatchConfidence; hardcover: MatchConfidence }
}

export async function readHardcoverToken(): Promise<{
  token: string | null
  status: ProviderTokenStatus
}> {
  const [lockedKeys, stored] = await Promise.all([
    getConfigLockedKeys(),
    getSetting("hardcoverApiToken"),
  ])
  const locked = lockedKeys.has("hardcoverApiToken")
  const fallback = env.HARDCOVER_API_TOKEN || null
  const token = stored || fallback

  return {
    token,
    status: {
      tokenSet: !!token,
      source: stored
        ? locked
          ? "config"
          : "database"
        : fallback
          ? "env"
          : null,
      locked,
      unreadable: stored === "",
    },
  }
}

export async function saveHardcoverToken(token: string | null) {
  if (!token) {
    await db
      .deleteFrom("settings")
      .where("name", "=", "hardcoverApiToken")
      .execute()
    return
  }

  const value = JSON.stringify(await encryptSecret(token))
  await db
    .insertInto("settings")
    .values({ name: "hardcoverApiToken", value })
    .onConflict((oc) => oc.column("name").doUpdateSet({ value }))
    .execute()
}
