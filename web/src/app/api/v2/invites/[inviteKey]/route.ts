import { withHasPermission } from "@/auth/auth"
import { deleteInvite, getInvite } from "@/database/users"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type Params = Promise<{
  inviteKey: string
}>

/**
 * @summary Get an invite details
 * @desc '
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<Params> },
) {
  const { inviteKey } = await context.params
  const invite = await getInvite(inviteKey)
  if (!invite) return new Response(null, { status: 404 })

  return NextResponse.json(invite)
}

/**
 * @summary Delete an invite
 * @desc '
 */
export const DELETE = withHasPermission<Params>("inviteDelete")(async (
  _request,
  context,
) => {
  const { inviteKey } = await context.params
  await deleteInvite(inviteKey)
  return new Response(null, { status: 204 })
})
