import { withHasPermission } from "@/auth"
import { createInvite, getInvites } from "@/database/invites"
import { sendInvite } from "@/invites"
import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"

export const dynamic = "force-dynamic"

export type InviteRequest = {
  email: string
  book_create: boolean
  book_delete: boolean
  book_read: boolean
  book_process: boolean
  book_download: boolean
  book_update: boolean
  book_list: boolean
  invite_list: boolean
  invite_delete: boolean
  user_create: boolean
  user_list: boolean
  user_read: boolean
  user_delete: boolean
  settings_update: boolean
}

export const POST = withHasPermission("user_create")(async (request) => {
  const { email, ...permissionsInput } = (await request.json()) as InviteRequest

  const key = randomBytes(6).toString("hex")

  const permissions = {
    bookCreate: permissionsInput.book_create,
    bookDelete: permissionsInput.book_delete,
    bookRead: permissionsInput.book_read,
    bookProcess: permissionsInput.book_process,
    bookDownload: permissionsInput.book_download,
    bookUpdate: permissionsInput.book_update,
    bookList: permissionsInput.book_list,
    inviteList: permissionsInput.invite_list,
    inviteDelete: permissionsInput.invite_delete,
    userCreate: permissionsInput.user_create,
    userList: permissionsInput.user_list,
    userRead: permissionsInput.user_read,
    userDelete: permissionsInput.user_delete,
    settingsUpdate: permissionsInput.settings_update,
  }

  await createInvite(email, key, permissions)

  try {
    await sendInvite(email, key)
  } catch (e) {
    console.error("Failed to send invite")
    console.error(e)
  }

  return NextResponse.json({ email, key })
})

export const GET = withHasPermission("invite_list")(async () => {
  const invites = await getInvites()
  return NextResponse.json(invites)
})
