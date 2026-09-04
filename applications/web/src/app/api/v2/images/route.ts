import { NextResponse } from "next/server"

import { MediaType } from "@storyteller-platform/media-types"

import { withHasPermission } from "@/auth/auth"
import { ingestImage, probeImage } from "@/images"

export const dynamic = "force-dynamic"

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

function parseFilename(contentDisposition: string | null) {
  if (!contentDisposition) return undefined

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      return undefined
    }
  }

  return /filename="([^"]*)"/i.exec(contentDisposition)?.[1] || undefined
}

/**
 * @summary Upload an image
 * @desc Accepts the raw image bytes as the request body, with the file name
 *       optionally given by a `Content-Disposition` header. The image is stored
 *       by the hash of its contents, so uploading the same bytes twice returns
 *       the existing image instead of making a duplicate. Uploading does not
 *       attach the image to anything.
 */
export const POST = withHasPermission(["bookUpdate", "settingsUpdate"])(async (
  request,
) => {
  const declaredLength = Number.parseInt(
    request.headers.get("content-length") ?? "",
    10,
  )

  if (declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { message: `Images must be smaller than ${MAX_UPLOAD_BYTES} bytes` },
      { status: 413 },
    )
  }

  const data = Buffer.from(await request.arrayBuffer())

  if (data.byteLength === 0) {
    return NextResponse.json(
      { message: "Expected the image bytes as the request body" },
      { status: 400 },
    )
  }

  if (data.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { message: `Images must be smaller than ${MAX_UPLOAD_BYTES} bytes` },
      { status: 413 },
    )
  }

  const probed = await probeImage(data)
  if (!probed) {
    return NextResponse.json(
      { message: "Could not read that file as an image" },
      { status: 415 },
    )
  }

  if (!MediaType.fromMime(probed.mimeType)?.cover) {
    return NextResponse.json(
      { message: `${probed.mimeType} images are not supported` },
      { status: 415 },
    )
  }

  const sourceName = parseFilename(request.headers.get("content-disposition"))

  const image = await ingestImage(data, { sourceName: sourceName ?? null })
  if (!image) {
    return NextResponse.json(
      { message: "Could not store that image" },
      { status: 500 },
    )
  }

  return NextResponse.json(image, { status: 201 })
})
