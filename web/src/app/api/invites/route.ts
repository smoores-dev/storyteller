import { withHasPermission } from "@/auth"
import { createInvite, getInvites } from "@/database/invites"
import { UserPermissions } from "@/database/users"
import { sendInvite } from "@/invites"
import { logger } from "@/logging"
import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"

export const dynamic = "force-dynamic"

export type InviteRequest = {
  email: string
  book_create?: boolean
  book_delete?: boolean
  book_read?: boolean
  book_process?: boolean
  book_download?: boolean
  book_update?: boolean
  book_list?: boolean
  invite_list?: boolean
  invite_delete?: boolean
  user_create?: boolean
  user_list?: boolean
  user_read?: boolean
  user_delete?: boolean
  user_update?: boolean
  settings_update?: boolean
}

export const POST = withHasPermission("user_create")(async (request) => {
  const { email, ...permissionsInput } = (await request.json()) as InviteRequest

  const key = randomBytes(6).toString("hex")

  const permissions: UserPermissions = {
    bookCreate: permissionsInput.book_create ?? false,
    bookDelete: permissionsInput.book_delete ?? false,
    bookRead: permissionsInput.book_read ?? false,
    bookProcess: permissionsInput.book_process ?? false,
    bookDownload: permissionsInput.book_download ?? false,
    bookUpdate: permissionsInput.book_update ?? false,
    bookList: permissionsInput.book_list ?? false,
    inviteList: permissionsInput.invite_list ?? false,
    inviteDelete: permissionsInput.invite_delete ?? false,
    userCreate: permissionsInput.user_create ?? false,
    userList: permissionsInput.user_list ?? false,
    userRead: permissionsInput.user_read ?? false,
    userDelete: permissionsInput.user_delete ?? false,
    userUpdate: permissionsInput.user_update ?? false,
    settingsUpdate: permissionsInput.settings_update ?? false,
  }

  createInvite(email, key, permissions)

  try {
    await sendInvite(email, key)
  } catch (e) {
    logger.error("Failed to send invite")
    logger.error(e)
  }

  return NextResponse.json({ email, key })
})

export const GET = withHasPermission("invite_list")(() => {
  const invites = getInvites()
  return NextResponse.json(invites)
})
