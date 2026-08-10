import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { ingestImage, probeImage } from "@/images"

export const dynamic = "force-dynamic"

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

const ALLOWED_MIME_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
]

/**
 * @summary Upload an image
 * @desc Accepts a multipart body with a `file` field. The image is stored by
 *       the hash of its contents, so uploading the same bytes twice returns
 *       the existing image instead of making a duplicate. Uploading does not
 *       attach the image to anything.
 */
export const POST = withHasPermission("bookUpdate")(async (request) => {
  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: "Expected a multipart body with a `file` field" },
      { status: 400 },
    )
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { message: `Images must be smaller than ${MAX_UPLOAD_BYTES} bytes` },
      { status: 413 },
    )
  }

  const data = Buffer.from(await file.arrayBuffer())

  const probed = await probeImage(data)
  if (!probed) {
    return NextResponse.json(
      { message: "Could not read that file as an image" },
      { status: 415 },
    )
  }

  if (!ALLOWED_MIME_TYPES.includes(probed.mimeType)) {
    return NextResponse.json(
      { message: `${probed.mimeType} images are not supported` },
      { status: 415 },
    )
  }

  const image = await ingestImage(data, { sourceName: file.name })
  if (!image) {
    return NextResponse.json(
      { message: "Could not store that image" },
      { status: 500 },
    )
  }

  return NextResponse.json(image, { status: 201 })
})
