import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { ApiTokenCreateSchema } from "@/database/apiTokenTypes"
import {
  READING_SCOPE,
  apiTokenExpiresAt,
  createApiToken,
  getApiTokens,
} from "@/database/apiTokens"

export const dynamic = "force-dynamic"

/**
 * @summary List the current user's API tokens
 */
export const GET = withHasPermission("manageSelf", { sessionOnly: true })(
  async (request) => {
    return NextResponse.json(await getApiTokens(request.auth.user.id))
  },
)

/**
 * @summary Create an API token for the current user
 * @desc The token is only returned once.
 */
export const POST = withHasPermission("manageSelf", { sessionOnly: true })(
  async (request) => {
    const parsed = ApiTokenCreateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    const token = await createApiToken(
      request.auth.user.id,
      parsed.data.name,
      parsed.data.access === "reading" ? READING_SCOPE : null,
      { expiresAt: apiTokenExpiresAt(parsed.data.expiration) },
    )

    return NextResponse.json({ token }, { status: 201 })
  },
)
