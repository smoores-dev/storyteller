import { createPrivateKey, sign } from "node:crypto"

import { decryptSecret } from "@/secrets"
import { type UUID } from "@/uuid"
import { getCurrentVersion } from "@/versions"

import { db } from "./connection"
import { getSettings } from "./settings"

export type ServerIdentity = {
  serverId: UUID
  publicKey: string
}

export async function getServerIdentity(): Promise<ServerIdentity> {
  const row = await db
    .selectFrom("serverIdentity")
    .select(["serverId", "publicKey"])
    .where("id", "=", 1)
    .executeTakeFirstOrThrow()

  return row
}

export async function signAsServer(challenge: Buffer): Promise<string> {
  const { privateKey } = await db
    .selectFrom("serverIdentity")
    .select("privateKey")
    .where("id", "=", 1)
    .executeTakeFirstOrThrow()

  const decrypted = await decryptSecret(privateKey)
  if (!decrypted) {
    throw new Error(
      "Could not decrypt this server's private key. STORYTELLER_SECRET_KEY has likely changed since the key was generated.",
    )
  }

  const key = createPrivateKey({
    key: Buffer.from(decrypted, "base64"),
    format: "der",
    type: "pkcs8",
  })

  return sign(null, challenge, key).toString("base64")
}

export type ServerCapability =
  | "book-upload"
  | "media-manage"
  | "metadata-edit"
  | "opds"
  | "progress-sync"
  | "readaloud-process"
  | "progress-sync/v3"

export type ServerIconInfo = {
  sha256: string
  blurhash: string | null
}

export type PublicServerInfo = {
  id: UUID
  publicUrl: string | null
  capabilities: ServerCapability[]
  publicKey: string
}

export type ServerInfo = PublicServerInfo & {
  name: string
  icon: ServerIconInfo | null
}

export type ServerDetails = ServerInfo & {
  version: string
}

async function resolveIcon(
  sha256: string | null | undefined,
): Promise<ServerIconInfo | null> {
  if (!sha256) return null

  const image = await db
    .selectFrom("image")
    .select(["sha256", "blurhash"])
    .where("sha256", "=", sha256)
    .executeTakeFirst()

  return image ?? null
}

function getCapabilities(opdsEnabled: boolean | null): ServerCapability[] {
  const capabilities: ServerCapability[] = [
    "book-upload",
    "media-manage",
    "metadata-edit",
    "progress-sync",
    "readaloud-process",
    "progress-sync/v3",
  ]

  if (opdsEnabled) capabilities.push("opds")

  return capabilities.sort()
}

export async function getPublicServerInfo(): Promise<PublicServerInfo> {
  const [{ serverId, publicKey }, settings] = await Promise.all([
    getServerIdentity(),
    getSettings(),
  ])

  return {
    id: serverId,
    publicUrl: settings.webUrl || null,
    capabilities: getCapabilities(settings.opdsEnabled),
    publicKey,
  }
}

export async function getServerInfo(): Promise<ServerInfo> {
  const [{ serverId, publicKey }, settings] = await Promise.all([
    getServerIdentity(),
    getSettings(),
  ])

  return {
    id: serverId,
    name: settings.libraryName || "Storyteller",
    publicUrl: settings.webUrl || null,
    icon: await resolveIcon(settings.serverIconSha256),
    capabilities: getCapabilities(settings.opdsEnabled),
    publicKey,
  }
}

export async function getServerIcon(): Promise<ServerIconInfo | null> {
  const { serverIconSha256 } = await getSettings()
  return await resolveIcon(serverIconSha256)
}

export async function getServerDetails(): Promise<ServerDetails> {
  const info = await getServerInfo()
  return { ...info, version: getCurrentVersion() }
}
