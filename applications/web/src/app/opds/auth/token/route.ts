import { NextResponse } from "next/server"
import { z } from "zod"

import { MediaType } from "@storyteller-platform/media-types"

import { createUserToken } from "@/auth/auth"
import { logger } from "@/logging"

export const dynamic = "force-dynamic"

const TokenRequestSchema = z.object({
  grant_type: z.string(),
  username: z.string(),
  password: z.string(),
})

export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body =
        request.headers.get("Content-Type") === MediaType.JSON.mime
          ? await request.json()
          : Object.fromEntries(await request.formData())
    } catch (err) {
      logger.error({ msg: "Error parsing request body", err })
    }

    const parsed = TokenRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "Invalid request body",
        },
        { status: 400 },
      )
    }

    const { grant_type, username, password } = parsed.data

    if (grant_type !== "password") {
      return NextResponse.json(
        {
          error: "unsupported_grant_type",
          error_description: "Only password grant type is supported",
        },
        { status: 400 },
      )
    }

    if (!username || !password) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "Username and password are required",
        },
        { status: 400 },
      )
    }

    const tokenResponse = await createUserToken(username, password)

    return NextResponse.json(tokenResponse, {
      headers: {
        "Content-Type": MediaType.JSON.mime,
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json(
      {
        error: "server_error",
        error_description: "An error occurred while processing your request",
      },
      { status: 500 },
    )
  }
}
