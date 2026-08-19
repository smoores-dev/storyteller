import { generateKeyPairSync, randomUUID } from "node:crypto"

import { sql } from "kysely"

import { db } from "@/database/connection"
import { logger } from "@/logging"
import { encryptSecret } from "@/secrets"

export default async function migrate() {
  const { rows } = await sql<{
    count: number
  }>`SELECT COUNT(*) AS count FROM server_identity`.execute(db)

  if ((rows[0]?.count ?? 0) > 0) return

  const { publicKey, privateKey } = generateKeyPairSync("ed25519")

  const serverId = randomUUID()
  const publicKeyDer = publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64")
  const privateKeyDer = await encryptSecret(
    privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  )

  await sql`
    INSERT INTO
      server_identity (id, server_id, public_key, private_key)
    VALUES
      (1, ${serverId}, ${publicKeyDer}, ${privateKeyDer})
  `.execute(db)

  logger.info(`Generated this server's identity: ${serverId}`)
}
