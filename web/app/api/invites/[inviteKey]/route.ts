import { withHasPermission } from "@/auth"
import { deleteInvite, getInvite } from "@/database/invites"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type Params = {
  inviteKey: string
}

export async function GET(_request: NextRequest, context: { params: Params }) {
  const invite = await getInvite(context.params.inviteKey)
  return NextResponse.json(invite)
}

export const DELETE = withHasPermission<Params>("invite_delete")(async (
  _request,
  context,
) => {
  await deleteInvite(context.params.inviteKey)
  return new Response(null, { status: 204 })
})
