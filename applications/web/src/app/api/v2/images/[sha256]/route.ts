import { withHasPermission } from "@/auth/auth"
import { getImageBySha256 } from "@/database/images"
import { getImageVariant, resolveVariant } from "@/images"

export const dynamic = "force-dynamic"

type Params = Promise<{
  sha256: string
}>

/**
 * @summary Get an image
 * @desc Images are addressed by the sha256 of their original bytes, so the
 *       response is immutable and safe to cache forever. Use the `s` search
 *       param to ask for a size: it is the longest edge in real pixels, and
 *       it snaps to a fixed ladder of buckets. The aspect ratio is always
 *       preserved, so the caller decides how to fit the result.
 */
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
