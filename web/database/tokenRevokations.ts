import { getDatabase } from "./connection"

export async function revokeToken(token: string) {
  const db = await getDatabase()

  await db.run(
    `
    INSERT INTO token_revokation (token)
    VALUES ($token)
    `,
    {
      $token: token,
    },
  )
}

export async function isTokenRevoked(token: string) {
  const db = await getDatabase()

  const row = await db.get<{ token: string } | null>(
    `
    SELECT token
    FROM token_revokation
    WHERE token = $token
    `,
    {
      $token: token,
    },
  )

  if (!row) return false

  const { token: found } = row

  return !!found
}
