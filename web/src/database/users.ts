import { UUID } from "@/uuid"
import { getDatabase } from "./connection"
import { mapValues } from "@/objects"

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
  userUpdate: boolean
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
  | "user_update"

export type User = {
  uuid: UUID
  username: string
  fullName: string
  email: string
  hashedPassword: string
  permissions: UserPermissions
}

// sqlite doesn't really have booleans, so it returns numbers here
type SqliteUserPermissions = { [K in keyof UserPermissions]: 0 | 1 }

export function getUser(usernameOrEmail: string): User | null {
  const db = getDatabase()

  const row = db
    .prepare<{ username: string }>(
      `
    SELECT
      user.uuid,
      user.full_name AS fullName,
      user.username,
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
      user_update AS userUpdate,
      settings_update AS settingsUpdate
    FROM user
    JOIN user_permission
      ON user.user_permission_uuid = user_permission.uuid
    WHERE username = $username OR email = $username
    `,
    )
    .get({
      username: usernameOrEmail.toLowerCase(),
    }) as null | (User & SqliteUserPermissions)

  if (!row) return null

  const { uuid, fullName, username, email, hashedPassword, ...permissions } =
    row

  return {
    uuid,
    username,
    fullName,
    email,
    hashedPassword,
    permissions: mapValues(permissions, (v) => v === 1),
  }
}

export function getUserCount() {
  const db = getDatabase()

  const { count } = db
    .prepare(
      `
    SELECT count(uuid) AS count
    FROM user;
    `,
    )
    .get() as { count: number }

  return count
}

export function getUsers() {
  const db = getDatabase()

  const rows = db
    .prepare(
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
      user_update AS userUpdate,
      settings_update AS settingsUpdate
    FROM user
    JOIN user_permission
      ON user.user_permission_uuid = user_permission.uuid
    `,
    )
    .all() as Array<User & SqliteUserPermissions>

  return rows.map((row) => {
    const { uuid, username, fullName, email, hashedPassword, ...permissions } =
      row

    return {
      uuid,
      username,
      fullName,
      email,
      hashedPassword,
      permissions: mapValues(permissions, (v) => v === 1),
    }
  })
}

export function createAdminUser(
  username: string,
  fullName: string,
  email: string,
  hashedPassword: string,
) {
  const db = getDatabase()

  const { uuid } = db
    .prepare(
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
      user_update,
      settings_update
    ) SELECT 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
    WHERE NOT EXISTS (
      SELECT uuid
      FROM user_permission
    )
    RETURNING uuid
    `,
    )
    .get() as { uuid: UUID }

  db.prepare<{
    username: string
    fullName: string
    email: string
    hashedPassword: string
    userPermissionUuid: UUID
  }>(
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
  ).run({
    username: username.toLowerCase(),
    fullName,
    email,
    hashedPassword,
    userPermissionUuid: uuid,
  })
}

export function deleteUser(userUuid: UUID) {
  const db = getDatabase()

  const { uuid: userPermissionUuid } = db
    .prepare<{ uuid: UUID }>(
      `
    SELECT user_permission_uuid
    FROM user
    WHERE uuid = $uuid
    `,
    )
    .get({
      uuid: userUuid,
    }) as { uuid: UUID }

  db.prepare<{ uuid: UUID }>(
    `
    DELETE FROM user
    WHERE uuid = $uuid
    `,
  ).run({
    uuid: userUuid,
  })

  db.prepare<{ userPermissionUuid: UUID }>(
    `
    DELETE FROM invite
    WHERE user_permission_uuid = $userPermissionUuid
    `,
  ).run({
    userPermissionUuid,
  })

  db.prepare<{ uuid: UUID }>(
    `
    DELETE FROM user_permission
    WHERE uuid = $uuid
    `,
  ).run({ uuid: userPermissionUuid })
}

export function createUser(
  username: string,
  fullName: string,
  email: string,
  hashedPassword: string,
  inviteKey: string,
) {
  const db = getDatabase()

  db.prepare<{
    username: string
    fullName: string
    email: string
    hashedPassword: string
    inviteKey: string
  }>(
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
  ).run({
    username: username.toLowerCase(),
    fullName,
    email,
    hashedPassword,
    inviteKey,
  })

  db.prepare<{ inviteKey: string }>(
    `
    DELETE FROM invite
    WHERE key = $inviteKey
    `,
  ).run({
    inviteKey,
  })
}

export function userHasPermission(username: string, permission: Permission) {
  const db = getDatabase()

  const result = db
    .prepare<{ username: string }>(
      `
    SELECT ${permission}
    FROM user_permission
    JOIN user
      ON user.user_permission_uuid = user_permission.uuid
    WHERE user.username = $username
    `,
    )
    .get({
      username: username.toLowerCase(),
    }) as
    | {
        [K in Permission]: 0 | 1
      }
    | null

  if (!result) return false

  const { [permission]: hasPermission } = result

  return hasPermission === 1
}

export function updateUserPermissions(
  userUuid: UUID,
  permissions: UserPermissions,
) {
  const db = getDatabase()

  const { uuid: userPermissionUuid } = db
    .prepare<{ uuid: UUID }>(
      `
    SELECT user_permission.uuid
    FROM user_permission
    JOIN user
      ON user.user_permission_uuid = user_permission.uuid
    WHERE user.uuid = $uuid
    `,
    )
    .get({ uuid: userUuid }) as { uuid: UUID }

  db.prepare<{ uuid: UUID } & { [K in keyof UserPermissions]: 0 | 1 }>(
    `
    UPDATE user_permission
    SET
      book_create = $bookCreate,
      book_delete = $bookDelete,
      book_read = $bookRead,
      book_process = $bookProcess,
      book_download = $bookDownload,
      book_update = $bookUpdate,
      book_list = $bookList,
      invite_list = $inviteList,
      invite_delete = $inviteDelete,
      user_create = $userCreate,
      user_list = $userList,
      user_read = $userRead,
      user_delete = $userDelete,
      user_update = $userUpdate,
      settings_update = $settingsUpdate
    WHERE
      uuid = $uuid
    `,
  ).run({
    uuid: userPermissionUuid,
    ...mapValues(permissions, (v) => (v ? 1 : 0)),
  })
}
