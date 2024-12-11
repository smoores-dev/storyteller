import { getDatabase } from "./connection"

export function revokeToken(token: string) {
  const db = getDatabase()

  db.prepare<{ token: string }>(
    `
    INSERT INTO token_revokation (token)
    VALUES ($token)
    `,
  ).run({
    token,
  })
}

export function isTokenRevoked(token: string) {
  const db = getDatabase()

  const row = db
    .prepare<{ token: string }>(
      `
    SELECT token
    FROM token_revokation
    WHERE token = $token
    `,
    )
    .get({
      token,
    }) as { token: string } | null

  if (!row) return false

  const { token: found } = row

  return !!found
}
