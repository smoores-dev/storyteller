import { getImageBySha256 } from "@/database/images"
import { getServerIcon } from "@/database/servers"
import { getImageVariant, resolveVariant } from "@/images"

export const dynamic = "force-dynamic"

export const GET = async (request: Request) => {
  const icon = await getServerIcon()
  if (!icon) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    })
  }

  const image = await getImageBySha256(icon.sha256)
  if (!image) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    })
  }

  const url = new URL(request.url)
  const requestedSize = Number.parseInt(url.searchParams.get("s") ?? "", 10)
  const variant = resolveVariant(
    Number.isNaN(requestedSize) ? null : requestedSize,
    image,
  )

  const etag = `"${image.sha256}-${variant}"`
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304 })
  }

  const encoded = await getImageVariant(image, variant)
  if (!encoded) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    })
  }

  return new Response(new Uint8Array(encoded.data), {
    headers: {
      "Content-Type": encoded.mimeType,
      "Cache-Control": "public, max-age=60, must-revalidate",
      Etag: etag,
    },
  })
}
