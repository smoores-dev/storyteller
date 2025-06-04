/**
 * <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16}}>
 *  <p>Official <a href="https://kysely.dev/">Kysely</a> adapter for Auth.js / NextAuth.js.</p>
 *  <a href="https://kysely.dev/">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/adapters/kysely.svg" width="30" />
 *  </a>
 * </div>
 *
 * ## Installation
 *
 * ```bash npm2yarn
 * npm install @auth/kysely-adapter kysely
 * ```
 *
 * @module @auth/kysely-adapter
 */
import { Insertable, Kysely } from "kysely"

import { type Adapter } from "@auth/core/adapters"
import { DB } from "./schema"
import { getUser, getUserByAccount, getUserByUsernameOrEmail } from "./users"
import { UUID } from "@/uuid"
import { jsonObjectFrom } from "kysely/helpers/sqlite"

export function KyselyAdapter(db: Kysely<DB>): Adapter {
  return {
    createUser() {
      throw new Error("No automatic signups allowed")
    },
    async getUser(id) {
      return getUser(id as UUID)
    },
    async getUserByEmail(email) {
      return getUserByUsernameOrEmail(email)
    },
    async getUserByAccount({ providerAccountId, provider }) {
      return getUserByAccount(providerAccountId, provider)
    },
    async updateUser({ id, ...user }) {
      await db
        .updateTable("user")
        .set(user)
        .where("id", "=", id as UUID)
        .execute()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return (await getUser(id as UUID))!
    },
    async deleteUser(userId) {
      await db
        .deleteFrom("user")
        .where("user.id", "=", userId as UUID)
        .execute()
    },
    async linkAccount(account) {
      const {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: tokenType,
        id_token: idToken,
        expires_at: expiresAt,
        ...values
      } = account

      const user = await getUser(account.userId as UUID)
      if (user?.inviteKey && !user.inviteAccepted) {
        throw new Error("Cannot link account for unaccepted invite")
      }

      await db
        .insertInto("account")
        .values({
          ...values,
          accessToken,
          refreshToken,
          tokenType,
          idToken,
          expiresAt,
        })
        .execute()

      return account
    },
    async unlinkAccount({ providerAccountId, provider }) {
      await db
        .deleteFrom("account")
        .where("account.providerAccountId", "=", providerAccountId)
        .where("account.provider", "=", provider)
        .execute()
    },
    async createSession(session) {
      await db
        .insertInto("session")
        .values(session as Insertable<DB["session"]>)
        .execute()
      return session
    },
    async getSessionAndUser(sessionToken) {
      const result = await db
        .selectFrom("session")
        .innerJoin("user", "user.id", "session.userId")
        .selectAll("user")
        .select((eb) => [
          jsonObjectFrom(
            eb
              .selectFrom("userPermission")
              .select([
                "bookCreate",
                "bookDelete",
                "bookRead",
                "bookProcess",
                "bookDownload",
                "bookUpdate",
                "bookList",
                "collectionCreate",
                "inviteList",
                "inviteDelete",
                "userCreate",
                "userList",
                "userRead",
                "userDelete",
                "userUpdate",
                "settingsUpdate",
              ])
              .whereRef("user.userPermissionUuid", "=", "userPermission.uuid"),
          ).as("permissions"),
        ])
        .select(["session.expires", "session.userId"])
        .where("session.sessionToken", "=", sessionToken)
        .executeTakeFirst()
      if (!result) return null
      const { userId, expires, ...user } = result
      const session = { sessionToken, userId, expires }
      return { user, session }
    },
    async updateSession(session) {
      return await db
        .updateTable("session")
        .set(session as Insertable<DB["session"]>)
        .where("session.sessionToken", "=", session.sessionToken)
        .returningAll()
        .executeTakeFirstOrThrow()
    },
    async deleteSession(sessionToken) {
      await db
        .deleteFrom("session")
        .where("session.sessionToken", "=", sessionToken)
        .execute()
    },
    async createVerificationToken(data) {
      await db.insertInto("verificationToken").values(data).execute()
      return data
    },
    async useVerificationToken({ identifier, token }) {
      const result = await db
        .deleteFrom("verificationToken")
        .where("verificationToken.token", "=", token)
        .where("verificationToken.identifier", "=", identifier)
        .returningAll()
        .executeTakeFirst()

      return result ?? null
    },
  }
}
