import { getDatabase } from "./connection"

export async function revokeToken(token: string) {
  const db = getDatabase()

  await db.insertInto("tokenRevokation").values({ token }).execute()
}

export async function isTokenRevoked(token: string) {
  const db = getDatabase()

  const row = await db
    .selectFrom("tokenRevokation")
    .select(["token"])
    .where("token", "=", token)
    .executeTakeFirst()

  if (!row) return false

  const { token: found } = row

  return !!found
}
