import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from "node:crypto"
import { promisify } from "node:util"

import { logger } from "@/logging"
import { readSecretKey } from "@/secretKey"

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

const PREFIX = "enc:v1:"
const KEY_SALT = "storyteller:secret-encryption:v1"
const KEY_LENGTH = 32
const IV_LENGTH = 12

declare global {
  // eslint-disable-next-line no-var
  var secretEncryptionKey: Promise<Buffer> | undefined
  // eslint-disable-next-line no-var
  var secretDecryptFailureLogged: boolean | undefined
  // eslint-disable-next-line no-var
  var secretDecryptions: Map<string, Promise<string | null>> | undefined
}

function logDecryptFailure(message: string) {
  if (globalThis.secretDecryptFailureLogged) {
    logger.debug(message)
    return
  }

  globalThis.secretDecryptFailureLogged = true
  logger.error(message)
}

function getKey(): Promise<Buffer> {
  globalThis.secretEncryptionKey ??= readSecretKey().then((secret) =>
    scryptAsync(secret, KEY_SALT, KEY_LENGTH),
  )
  return globalThis.secretEncryptionKey
}

export function isEncrypted(value: string) {
  return value.startsWith(PREFIX)
}

export async function encryptSecret(plaintext: string): Promise<string> {
  if (!plaintext || isEncrypted(plaintext)) return plaintext

  const key = await getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv("aes-256-gcm", key, iv)

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ])

  return [
    PREFIX + iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":")
}

export function decryptSecret(
  value: string,
  key?: string,
): Promise<string | null> {
  if (!isEncrypted(value)) {
    return Promise.resolve(value)
  }

  globalThis.secretDecryptions ??= new Map()
  let decrypted = globalThis.secretDecryptions.get(value)
  if (!decrypted) {
    decrypted = decryptValue(value, key)
    globalThis.secretDecryptions.set(value, decrypted)
  }

  return decrypted
}

async function decryptValue(
  value: string,
  key?: string,
): Promise<string | null> {
  const [iv, tag, ciphertext] = value.slice(PREFIX.length).split(":")
  if (!iv || !tag || !ciphertext) {
    logDecryptFailure(
      `${key ? `"${key}"` : "A stored secret"} is malformed and could not be decrypted`,
    )
    return null
  }

  try {
    const key = await getKey()
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    )
    decipher.setAuthTag(Buffer.from(tag, "base64url"))

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf-8")
  } catch {
    logDecryptFailure(
      `Could not decrypt ${key ? `"${key}"` : "a stored secret"}. This usually means STORYTELLER_SECRET_KEY changed since the secret was saved. Re-enter ${key} credential in settings to store it again.`,
    )
    return null
  }
}
