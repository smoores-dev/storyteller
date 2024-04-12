import { UUID } from "@/uuid"
import { getDatabase } from "./connection"

export type UserPermissions = {
  bookCreate: boolean
  bookDelete: boolean
  bookDownload: boolean
  bookList: boolean
  bookProcess: boolean
  bookRead: boolean
  bookUpdate: boolean
  inviteDelete: boolean
  inviteList: boolean
  settingsUpdate: boolean
  userCreate: boolean
  userDelete: boolean
  userList: boolean
  userRead: boolean
}

export type Permission =
  | "book_create"
  | "book_delete"
  | "book_download"
  | "book_list"
  | "book_process"
  | "book_read"
  | "book_update"
  | "invite_delete"
  | "invite_list"
  | "settings_update"
  | "user_create"
  | "user_delete"
  | "user_list"
  | "user_read"

export type User = {
  uuid: UUID
  username: string
  fullName: string
  email: string
  hashedPassword: string
  permissions: UserPermissions
}

export async function getUser(username: string): Promise<User | null> {
  const db = await getDatabase()

  const row = await db.get<null | (Omit<User, "username"> & UserPermissions)>(
    `
    SELECT
      user.uuid,
      user.full_name AS fullName,
      user.email,
      user.hashed_password AS hashedPassword,
      book_create AS bookCreate,
      book_read AS bookRead,
      book_process AS bookProcess,
      book_download AS bookDownload,
      book_delete AS bookDelete,
      book_update AS bookUpdate,
      book_list AS bookList,
      invite_list AS inviteList,
      invite_delete AS inviteDelete,
      user_create AS userCreate,
      user_list AS userList,
      user_read AS userRead,
      user_delete AS userDelete,
      settings_update AS settingsUpdate
    FROM user
    JOIN user_permission
      ON user.user_permission_uuid = user_permission.uuid
    WHERE username = $username
    `,
    {
      $username: username,
    },
  )

  if (!row) return null

  const { uuid, fullName, email, hashedPassword, ...permissions } = row

  return {
    uuid,
    username,
    fullName,
    email,
    hashedPassword,
    permissions,
  }
}

export async function getUserCount() {
  const db = await getDatabase()

  const { count } = await db.get<{ count: number }>(
    `
    SELECT count(uuid) AS count
    FROM user;
    `,
  )

  return count
}

export async function getUsers() {
  const db = await getDatabase()

  const rows = await db.all<User & UserPermissions>(
    `
    SELECT
      user.uuid,
      user.username,
      user.full_name AS fullName,
      user.email,
      user.hashed_password AS hashedPassword,
      book_create AS bookCreate,
      book_read AS bookRead,
      book_process AS bookProcess,
      book_download AS bookDownload,
      book_delete AS bookDelete,
      book_update AS bookUpdate,
      book_list AS bookList,
      invite_list AS inviteList,
      invite_delete AS inviteDelete,
      user_create AS userCreate,
      user_list AS userList,
      user_read AS userRead,
      user_delete AS userDelete,
      settings_update AS settingsUpdate
    FROM user
    JOIN user_permission
      ON user.user_permission_uuid = user_permission.uuid
    `,
  )

  return rows.map((row) => {
    const { uuid, username, fullName, email, hashedPassword, ...permissions } =
      row

    return {
      uuid,
      username,
      fullName,
      email,
      hashedPassword,
      permissions,
    }
  })
}

export async function createAdminUser(
  username: string,
  fullName: string,
  email: string,
  hashedPassword: string,
) {
  const db = await getDatabase()

  const { uuid } = await db.get<{ uuid: UUID }>(
    `
    INSERT INTO user_permission (
      book_create,
      book_delete,
      book_read,
      book_process,
      book_download,
      book_update,
      book_list,
      invite_list,
      invite_delete,
      user_create,
      user_list,
      user_read,
      user_delete,
      settings_update
    ) SELECT 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
    WHERE NOT EXISTS (
      SELECT uuid
      FROM user_permission
    )
    RETURNING uuid
    `,
  )

  await db.run(
    `
    INSERT INTO user (
      username,
      full_name,
      email,
      hashed_password,
      user_permission_uuid
    ) SELECT
      $username,
      $fullName,
      $email,
      $hashedPassword,
      $userPermissionUuid
    WHERE NOT EXISTS (
      SELECT uuid
      FROM user
    )
    `,
    {
      $username: username,
      $fullName: fullName,
      $email: email,
      $hashedPassword: hashedPassword,
      $userPermissionUuid: uuid,
    },
  )
}

export async function deleteUser(userUuid: UUID) {
  const db = await getDatabase()

  const { uuid: userPermissionUuid } = await db.get<{ uuid: UUID }>(
    `
    SELECT user_permission_uuid
    FROM user
    WHERE uuid = $uuid
    `,
    {
      $uuid: userUuid,
    },
  )

  await db.run(
    `
    DELETE FROM user
    WHERE uuid = $uuid
    `,
    {
      $uuid: userUuid,
    },
  )

  await db.run(
    `
    DELETE FROM invite
    WHERE user_permission_uuid = $userPermissionUuid
    `,
    {
      $userPermissionUuid: userPermissionUuid,
    },
  )

  await db.run(
    `
    DELETE FROM user_permission
    WHERE uuid = $uuid
    `,
    { $uuid: userPermissionUuid },
  )
}

export async function createUser(
  username: string,
  fullName: string,
  email: string,
  hashedPassword: string,
  inviteKey: string,
) {
  const db = await getDatabase()

  await db.run(
    `
    INSERT INTO user (
      username,
      full_name,
      email,
      hashed_password,
      user_permission_uuid
    ) VALUES (
      $username,
      $fullName,
      $email,
      $hashedPassword,
      (
        SELECT user_permission_uuid
        FROM invite
        WHERE invite.key = $inviteKey
      )
    ) 
    `,
    {
      $username: username,
      $fullName: fullName,
      $email: email,
      $hashedPassword: hashedPassword,
      $inviteKey: inviteKey,
    },
  )

  await db.run(
    `
    DELETE FROM invite
    WHERE key = $inviteKey
    `,
    {
      $inviteKey: inviteKey,
    },
  )
}

export async function userHasPermission(
  username: string,
  permission: Permission,
) {
  const db = await getDatabase()

  const { [permission]: hasPermission } = await db.get<{
    [K in Permission]: boolean
  }>(
    `
    SELECT ${permission}
    FROM user_permission
    JOIN user
      ON user.user_permission_uuid = user_permission.uuid
    WHERE user.username = $username
    `,
    {
      $username: username,
    },
  )

  return hasPermission
}
