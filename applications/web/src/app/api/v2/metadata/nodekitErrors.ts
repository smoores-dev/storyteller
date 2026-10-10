import { NextResponse } from "next/server"

import { NodeKitLoadError } from "@storyteller-platform/nodekit"

import { logger } from "@/logging"

export type MetadataErrorCode =
  | "unavailable"
  | "noToken"
  | "unauthorized"
  | "rateLimited"
  | "failed"

export function metadataErrorResponse(
  code: MetadataErrorCode,
  message: string,
  status: number,
) {
  return NextResponse.json({ code, message }, { status })
}

export function nodekitErrorResponse(error: unknown): NextResponse {
  if (error instanceof NodeKitLoadError) {
    logger.error({ err: error, msg: "The nodekit addon is not available" })
    return metadataErrorResponse(
      "unavailable",
      "Metadata import is not available on this server",
      503,
    )
  }

  if (!(error instanceof Error) || error.name !== "ProviderError") {
    throw error
  }

  const { message } = error

  if (message === "noToken") {
    return metadataErrorResponse(
      "noToken",
      "This provider needs an API token",
      400,
    )
  }

  if (message === "unauthorized") {
    return metadataErrorResponse(
      "unauthorized",
      "The provider rejected the saved API token",
      400,
    )
  }

  if (message === "rateLimited") {
    logger.warn({ msg: "A metadata provider is rate limiting requests" })
    return metadataErrorResponse(
      "rateLimited",
      "The provider is getting too many requests, try again in a minute",
      429,
    )
  }

  logger.error({ err: error, msg: "Metadata provider request failed" })
  return metadataErrorResponse(
    "failed",
    "The metadata provider request failed",
    502,
  )
}
