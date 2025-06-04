import { db } from "./connection"

export async function revokeToken(token: string) {
  await db.insertInto("tokenRevokation").values({ token }).execute()
}

export async function isTokenRevoked(token: string) {
  const row = await db
    .selectFrom("tokenRevokation")
    .select(["token"])
    .where("token", "=", token)
    .executeTakeFirst()

  if (!row) return false

  const { token: found } = row

  return !!found
}
