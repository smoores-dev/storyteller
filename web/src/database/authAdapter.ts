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
import { type Adapter, type AdapterUser } from "@auth/core/adapters"
import { type Insertable, type Kysely } from "kysely"
import { jsonObjectFrom } from "kysely/helpers/sqlite"

import { type UUID } from "@/uuid"

import { type DB } from "./schema"
import { getDefaultStatus } from "./statuses"
import { getUser, getUserByAccount, getUserByUsernameOrEmail } from "./users"

const NO_PERMISSIONS = {
  bookRead: false,
  bookDownload: false,
  bookList: false,
  bookCreate: false,
  bookDelete: false,
  bookProcess: false,
  bookUpdate: false,
  collectionCreate: false,
  inviteList: false,
  inviteDelete: false,
  userCreate: false,
  userList: false,
  userRead: false,
  userDelete: false,
  userUpdate: false,
  settingsUpdate: false,
}

const BASIC_PERMISSIONS = {
  ...NO_PERMISSIONS,
  bookRead: true,
  bookDownload: true,
  bookList: true,
}

function computePermissions(
  groups: string[] | undefined,
  groupPermissions: Record<string, string[]> | undefined,
) {
  if (!groupPermissions) return BASIC_PERMISSIONS
  const granted = new Set(groups?.flatMap((g) => groupPermissions[g] ?? []))
  if (granted.size === 0) return NO_PERMISSIONS
  return Object.fromEntries(
    Object.keys(NO_PERMISSIONS).map((k) => [k, granted.has(k)]),
  ) as typeof NO_PERMISSIONS
}

export function KyselyAdapter(
  db: Kysely<DB>,
  providerGroupPermissions?: Map<string, Record<string, string[]>>,
): Adapter {
  return {
    async createUser(user) {
      const { username, groups, providerId } = user as AdapterUser & {
        username?: string
        groups?: string[]
        providerId?: string
      }
      const groupPermissions = providerId
        ? providerGroupPermissions?.get(providerId)
        : undefined
      const permissions = computePermissions(groups, groupPermissions)
      const userId = await db.transaction().execute(async (tr) => {
        const { uuid: permUuid } = await tr
          .insertInto("userPermission")
          .values(permissions)
          .returning(["uuid"])
          .executeTakeFirstOrThrow()
        const { id } = await tr
          .insertInto("user")
          .values({
            email: user.email,
            username,
            name: user.name,
            emailVerified: user.emailVerified,
            userPermissionUuid: permUuid,
          })
          .returning(["id"])
          .executeTakeFirstOrThrow()
        const defaultStatus = await getDefaultStatus(tr)
        await tr
          .insertInto("bookToStatus")
          .columns(["bookUuid", "userId", "statusUuid"])
          .expression((eb) =>
            eb
              .selectFrom("book")
              .select((eb) => [
                "book.uuid",
                eb.val(id).as("userId"),
                eb.val(defaultStatus.uuid).as("statusUuid"),
              ]),
          )
          .execute()
        return id
      })
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return (await getUser(userId))!
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
        .set({
          ...user,
          ...(user.username && { username: user.username.toLowerCase() }),
        })
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
