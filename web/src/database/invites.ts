import { UUID } from "@/uuid"
import { getDatabase } from "./connection"
import { UserPermissions } from "./users"

export type Invite = {
  email: string
  key: string
}

export function createInvite(
  email: string,
  key: string,
  permissions: UserPermissions,
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
      settings_update
  ) VALUES (
      $bookCreate,
      $bookDelete,
      $bookRead,
      $bookProcess,
      $bookDownload,
      $bookUpdate,
      $bookList,
      $inviteList,
      $inviteDelete,
      $userCreate,
      $userList,
      $userRead,
      $userDelete,
      $settingsUpdate
  )
  RETURNING uuid
  `,
    )
    .get({
      bookCreate: permissions.bookCreate ? 1 : 0,
      bookDelete: permissions.bookDelete ? 1 : 0,
      bookRead: permissions.bookRead ? 1 : 0,
      bookProcess: permissions.bookProcess ? 1 : 0,
      bookDownload: permissions.bookDownload ? 1 : 0,
      bookUpdate: permissions.bookUpdate ? 1 : 0,
      bookList: permissions.bookList ? 1 : 0,
      inviteList: permissions.inviteList ? 1 : 0,
      inviteDelete: permissions.inviteDelete ? 1 : 0,
      userCreate: permissions.userCreate ? 1 : 0,
      userList: permissions.userList ? 1 : 0,
      userRead: permissions.userRead ? 1 : 0,
      userDelete: permissions.userDelete ? 1 : 0,
      settingsUpdate: permissions.settingsUpdate ? 1 : 0,
    }) as { uuid: UUID }

  db.prepare(
    `
    INSERT INTO invite (email, key, user_permission_uuid)
    VALUES ($email, $key, $userPermissionUuid)
    `,
  ).run({
    email,
    key,
    userPermissionUuid: uuid,
  })
}

export function getInvite(key: string): Invite {
  const db = getDatabase()

  const { email } = db
    .prepare<{ key: string }>(
      `
    SELECT email
    FROM invite
    WHERE key = $key
    `,
    )
    .get({
      key,
    }) as { email: string }

  return { email, key }
}

export function getInvites(): Invite[] {
  const db = getDatabase()

  return db
    .prepare(
      `
    SELECT invite.email, key
    FROM invite
    JOIN user_permission
      ON user_permission.uuid = invite.user_permission_uuid
    LEFT JOIN user
      ON user.user_permission_uuid = user_permission.uuid
    WHERE user.uuid IS NULL
    `,
    )
    .all() as Invite[]
}

export function verifyInvite(email: string, key: string) {
  const db = getDatabase()

  return !!db
    .prepare<{ email: string; key: string }>(
      `
    SELECT uuid
    FROM invite
    WHERE email = $email
      AND key = $key
    `,
    )
    .get({
      email,
      key,
    })
}

export function deleteInvite(key: string) {
  const db = getDatabase()

  const acceptedUser = db
    .prepare<{ key: string }>(
      `
    SELECT user.id
    FROM user
    JOIN user_permission
      ON user.user_permission_uuid = user_permission.uuid
    JOIN invite
      ON invite.user_permission_uuid = user_permission.uuid
    WHERE invite.key = $key
    `,
    )
    .get({
      key,
    })

  if (acceptedUser) {
    throw new Error("User has already accepted this invite")
  }

  const { uuid: userPermissionUuid } = db
    .prepare<{ key: string }>(
      `
    SELECT user_permission_uuid
    FROM invite
    WHERE invite.key = $key
    `,
    )
    .get({
      key,
    }) as { uuid: UUID }

  db.prepare<{ key: string }>(
    `
    DELETE FROM invite
    WHERE key = $key
    `,
  ).run({ key })

  db.prepare<{ uuid: UUID }>(
    `
    DELETE FROM user_permission
    WHERE uuid = $uuid
    `,
  ).run({ uuid: userPermissionUuid })
}
