import { UUID } from "@/uuid"
import { getDatabase } from "./connection"
import { Insertable, Selectable, Updateable } from "kysely"
import { DB } from "./schema"
import { jsonObjectFrom } from "kysely/helpers/sqlite"

export type UserPermission = Selectable<DB["userPermission"]>
export type NewUserPermission = Insertable<DB["userPermission"]>
export type UserPermissionUpdate = Updateable<DB["userPermission"]>

export type UserPermissionSet = Omit<
  UserPermission,
  "uuid" | "id" | "createdAt" | "updatedAt"
>

export type Permission = keyof UserPermissionSet

export type User = Selectable<DB["user"]>

export async function getUser(usernameOrEmail: string) {
  const db = getDatabase()

  const row = await db
    .selectFrom("user")
    .select(["uuid", "fullName", "username", "email", "hashedPassword"])
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
    .where((eb) =>
      eb.or([
        eb("username", "=", usernameOrEmail.toLowerCase()),
        eb("email", "=", usernameOrEmail.toLowerCase()),
      ]),
    )
    .executeTakeFirst()

  return row ?? null
}

export async function getUserCount() {
  const db = getDatabase()

  const { count } = await db
    .selectFrom("user")
    .select([(eb) => eb.fn.count("uuid").as("count")])
    .executeTakeFirstOrThrow()

  return count as number
}

export async function getUsers() {
  const db = getDatabase()

  const rows = await db
    .selectFrom("user")
    .select(["uuid", "fullName", "username", "email", "hashedPassword"])
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
    .execute()

  return rows
}

export async function createAdminUser(
  username: string,
  fullName: string,
  email: string,
  hashedPassword: string,
) {
  const db = getDatabase()

  const { uuid } = await db
    .insertInto("userPermission")
    .columns([
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
    .expression((eb) =>
      db
        .selectNoFrom([
          eb.lit(1).as("bookCreate"),
          eb.lit(1).as("bookDelete"),
          eb.lit(1).as("bookRead"),
          eb.lit(1).as("bookProcess"),
          eb.lit(1).as("bookDownload"),
          eb.lit(1).as("bookUpdate"),
          eb.lit(1).as("bookList"),
          eb.lit(1).as("collectionCreate"),
          eb.lit(1).as("inviteList"),
          eb.lit(1).as("inviteDelete"),
          eb.lit(1).as("userCreate"),
          eb.lit(1).as("userList"),
          eb.lit(1).as("userRead"),
          eb.lit(1).as("userDelete"),
          eb.lit(1).as("userUpdate"),
          eb.lit(1).as("settingsUpdate"),
        ])
        .where((web) =>
          web.not(
            web.exists(web.selectFrom("userPermission").select(["uuid"])),
          ),
        ),
    )
    .returning(["uuid"])
    .executeTakeFirstOrThrow()

  await db
    .insertInto("user")
    .values({
      username: username.toLowerCase(),
      fullName,
      email,
      hashedPassword,
      userPermissionUuid: uuid,
    })
    .execute()
}

export async function deleteUser(userUuid: UUID) {
  const db = getDatabase()

  const { userPermissionUuid } = await db
    .selectFrom("user")
    .select(["userPermissionUuid"])
    .where("uuid", "=", userUuid)
    .executeTakeFirstOrThrow()

  await db.deleteFrom("user").where("uuid", "=", userUuid).execute()

  await db
    .deleteFrom("invite")
    .where("userPermissionUuid", "=", userPermissionUuid)
    .execute()

  await db
    .deleteFrom("userPermission")
    .where("uuid", "=", userPermissionUuid)
    .execute()
}

export async function createUser(
  username: string,
  fullName: string,
  email: string,
  hashedPassword: string,
  inviteKey: string,
) {
  const db = getDatabase()

  await db
    .insertInto("user")
    .values((eb) => ({
      username,
      fullName,
      email,
      hashedPassword,
      userPermissionUuid: eb
        .selectFrom("invite")
        .select(["userPermissionUuid"])
        .where("key", "=", inviteKey),
    }))
    .execute()

  await db.deleteFrom("invite").where("key", "=", inviteKey).execute()
}

export async function userHasPermission(
  username: string,
  permission: Permission,
) {
  const db = getDatabase()

  const result = await db
    .selectFrom("userPermission")
    .select([permission])
    .innerJoin("user", "user.userPermissionUuid", "userPermission.uuid")
    .where("user.username", "=", username)
    .executeTakeFirst()

  if (!result) return false

  const { [permission]: hasPermission } = result

  return hasPermission
}

export async function updateUserPermissions(
  userUuid: UUID,
  permissions: UserPermissionUpdate,
) {
  const db = getDatabase()

  const { userPermissionUuid } = await db
    .selectFrom("userPermission")
    .select(["userPermission.uuid as userPermissionUuid"])
    .innerJoin("user", "user.userPermissionUuid", "userPermission.uuid")
    .where("user.uuid", "=", userUuid)
    .executeTakeFirstOrThrow()

  await db
    .updateTable("userPermission")
    .set({
      bookCreate: permissions.bookCreate,
      bookUpdate: permissions.bookUpdate,
      bookList: permissions.bookList,
      bookDelete: permissions.bookDelete,
      bookDownload: permissions.bookDownload,
      bookProcess: permissions.bookProcess,
      collectionCreate: permissions.collectionCreate,
      inviteDelete: permissions.inviteDelete,
      inviteList: permissions.inviteList,
      settingsUpdate: permissions.settingsUpdate,
      userCreate: permissions.userCreate,
      userList: permissions.userList,
      userRead: permissions.userRead,
      userDelete: permissions.userDelete,
      userUpdate: permissions.userUpdate,
    })
    .where("uuid", "=", userPermissionUuid)
    .execute()
}
