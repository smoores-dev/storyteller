import { InviteRequest } from "@/apiModels"
import { withHasPermission } from "@/auth"
import { createInvite, getInvites } from "@/database/invites"
import { sendInvite } from "@/invites"
import { logger } from "@/logging"
import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"

export const dynamic = "force-dynamic"

/**
 * @summary Create an invite for a new user
 * @desc If the server is configured for SMTP, this will also trigger
 *       an email send to the specified email address with a link to
 *       accept the invite.
 */
export const POST = withHasPermission("userCreate")(async (request) => {
  const { email, ...permissions } = (await request.json()) as InviteRequest

  const key = randomBytes(6).toString("hex")

  await createInvite(email, key, permissions)

  try {
    await sendInvite(email, key)
  } catch (e) {
    logger.error("Failed to send invite")
    logger.error(e)
  }

  return NextResponse.json({ email, key })
})

/**
 * @summary List all invites
 * @desc '
 */
export const GET = withHasPermission("inviteList")(async () => {
  const invites = await getInvites()
  return NextResponse.json(invites)
})
