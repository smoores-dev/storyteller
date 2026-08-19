import { withHasPermission } from "@/auth/auth"
import { getImageBySha256 } from "@/database/images"
import { getImageVariant, resolveVariant } from "@/images"

export const dynamic = "force-dynamic"

type Params = Promise<{
  sha256: string
}>

export const GET = withHasPermission<Params>("bookRead", {
  allowBasicAuth: true,
})(async (request, context) => {
  const { sha256 } = await context.params

  const image = await getImageBySha256(sha256)
  if (!image) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    })
  }

  const requestedSize = Number.parseInt(
    request.nextUrl.searchParams.get("s") ?? "",
    10,
  )
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
      "Cache-Control": "public, max-age=31536000, immutable",
      Etag: etag,
    },
  })
})
