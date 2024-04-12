import { UUID } from "@/uuid"
import { getDatabase } from "./connection"
import { UserPermissions } from "./users"

export type Invite = {
  email: string
  key: string
}

export async function createInvite(
  email: string,
  key: string,
  permissions: UserPermissions,
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
    {
      $bookCreate: permissions.bookCreate,
      $bookDelete: permissions.bookDelete,
      $bookRead: permissions.bookRead,
      $bookProcess: permissions.bookProcess,
      $bookDownload: permissions.bookDownload,
      $bookUpdate: permissions.bookUpdate,
      $bookList: permissions.bookList,
      $inviteList: permissions.inviteList,
      $inviteDelete: permissions.inviteDelete,
      $userCreate: permissions.userCreate,
      $userList: permissions.userList,
      $userRead: permissions.userRead,
      $userDelete: permissions.userDelete,
      $settingsUpdate: permissions.settingsUpdate,
    },
  )

  await db.run(
    `
    INSERT INTO invite (email, key, user_permission_uuid)
    VALUES ($email, $key, $user_permission_uuid)
    `,
    {
      $email: email,
      $key: key,
      $user_permission_uuid: uuid,
    },
  )
}

export async function getInvite(key: string): Promise<Invite> {
  const db = await getDatabase()

  const { email } = await db.get<{ email: string }>(
    `
    SELECT email
    FROM invite
    WHERE key = $key
    `,
    {
      $key: key,
    },
  )

  return { email, key }
}

export async function getInvites(): Promise<Invite[]> {
  const db = await getDatabase()

  return db.all<Invite>(
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
}

export async function verifyInvite(email: string, key: string) {
  const db = await getDatabase()

  return !db.get(
    `
    SELECT uuid
    FROM invite
    WHERE email = $email
      AND key = $key
    `,
    {
      $email: email,
      $key: key,
    },
  )
}

export async function deleteInvite(key: string) {
  const db = await getDatabase()

  const acceptedUser = await db.get(
    `
    SELECT user.id
    FROM user
    JOIN user_permission
      ON user.user_permission_uuid = user_permission.uuid
    JOIN invite
      ON invite.user_permission_uuid = user_permission.uuid
    WHERE invite.key = $key
    `,
    {
      $key: key,
    },
  )

  if (acceptedUser) {
    throw new Error("User has already accepted this invite")
  }

  const { uuid: userPermissionUuid } = await db.get<{ uuid: UUID }>(
    `
    SELECT user_permission_uuid
    FROM invite
    WHERE invite.key = $key
    `,
    {
      $key: key,
    },
  )

  await db.run(
    `
    DELETE FROM invite
    WHERE key = $key
    `,
    { $key: key },
  )

  await db.run(
    `
    DELETE FROM user_permission
    WHERE uuid = $uuid
    `,
    { $uuid: userPermissionUuid },
  )
}
