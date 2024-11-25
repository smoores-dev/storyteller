import { withHasPermission } from "@/auth"
import { getInvite } from "@/database/invites"
import { sendInvite } from "@/invites"
import { NextResponse } from "next/server"

type Params = Promise<{
  inviteKey: string
}>

export const POST = withHasPermission<Params>("user_create")(async (
  _request,
  context,
) => {
  const { inviteKey } = await context.params
  const key = inviteKey

  const invite = getInvite(key)

  await sendInvite(invite.email, key)

  return new NextResponse(null, { status: 204 })
})
