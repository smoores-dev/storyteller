import { NextResponse } from "next/server"
import { z } from "zod"

import {
  metadataErrorResponse,
  nodekitErrorResponse,
} from "@/app/api/v2/metadata/nodekitErrors"
import { withHasPermission } from "@/auth/auth"
import {
  type MetadataProvidersResponse,
  readHardcoverToken,
  saveHardcoverToken,
} from "@/database/providerTokens"
import { getSetting } from "@/database/settings"
import { getNodeKit } from "@/services/nodekitService"

export const dynamic = "force-dynamic"

async function providersResponse() {
  const { status } = await readHardcoverToken()
  return NextResponse.json({
    available: getNodeKit().available(),
    hardcover: status,
    thresholds: await getSetting("metadataAutoImportThresholds"),
  } satisfies MetadataProvidersResponse)
}

export const GET = withHasPermission("bookRead")(providersResponse)

const TokenUpdateSchema = z.object({ token: z.string().trim().min(1) })

export const PUT = withHasPermission("settingsUpdate")(async (request) => {
  const parsed = TokenUpdateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ message: "token is required" }, { status: 400 })
  }

  const { status } = await readHardcoverToken()
  if (status.locked) {
    return NextResponse.json(
      { message: "The Hardcover token is set in the config file" },
      { status: 409 },
    )
  }

  try {
    const valid = await getNodeKit().verifyHardcoverToken(parsed.data.token)
    if (!valid) {
      return metadataErrorResponse(
        "unauthorized",
        "Hardcover rejected this token",
        400,
      )
    }
  } catch (error) {
    return nodekitErrorResponse(error)
  }

  await saveHardcoverToken(parsed.data.token)
  getNodeKit().invalidateTokens()

  return providersResponse()
})

export const DELETE = withHasPermission("settingsUpdate")(async () => {
  const { status } = await readHardcoverToken()
  if (status.locked) {
    return NextResponse.json(
      { message: "The Hardcover token is set in the config file" },
      { status: 409 },
    )
  }

  await saveHardcoverToken(null)
  getNodeKit().invalidateTokens()

  return providersResponse()
})
