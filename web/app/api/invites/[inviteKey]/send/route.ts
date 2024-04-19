import { withHasPermission } from "@/auth"
import { getInvite } from "@/database/invites"
import { sendInvite } from "@/invites"
import { NextResponse } from "next/server"

type Params = {
  inviteKey: string
}

export const POST = withHasPermission<Params>("user_create")(async (
  _request,
  context,
) => {
  const key = context.params.inviteKey

  const invite = await getInvite(key)

  await sendInvite(invite.email, key)

  return new NextResponse(null, { status: 204 })
})
