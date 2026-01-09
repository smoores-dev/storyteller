import { NextResponse } from "next/server"

import { createUserToken } from "@/auth/auth"
import { logger } from "@/logging"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    let password: string | null = null
    let username: string | null = null
    let grant_type: string | null = null
    try {
      if (request.headers.get("Content-Type") === "application/json") {
        const body = (await request.json()) as {
          username: string
          password: string
          grant_type: string
        }
        password = body.password
        username = body.username
        grant_type = body.grant_type
      } else {
        const body = await request.formData()
        const pw = body.get("password")?.valueOf()
        const uname = body.get("username")?.valueOf()
        const gtype = body.get("grant_type")?.valueOf()
        if (
          typeof pw !== "string" ||
          typeof uname !== "string" ||
          typeof gtype !== "string"
        ) {
          return NextResponse.json(
            {
              error: "invalid_request",
              error_description: "Invalid request body",
            },
            { status: 400 },
          )
        }
        password = pw
        username = uname
        grant_type = gtype
      }
    } catch (err) {
      logger.error({ msg: "Error parsing request body", err })
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "Invalid request body",
        },
        { status: 400 },
      )
    }

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
        "Content-Type": "application/json",
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
