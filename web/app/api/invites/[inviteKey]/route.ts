import { withHasPermission } from "@/auth"
import { deleteInvite, getInvite } from "@/database/invites"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type Params = {
  inviteKey: string
}

export function GET(_request: NextRequest, context: { params: Params }) {
  const invite = getInvite(context.params.inviteKey)
  return NextResponse.json(invite)
}

export const DELETE = withHasPermission<Params>("invite_delete")((
  _request,
  context,
) => {
  deleteInvite(context.params.inviteKey)
  return new Response(null, { status: 204 })
})
