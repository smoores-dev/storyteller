import { getImageBySha256 } from "@/database/images"
import { getServerIcon } from "@/database/servers"
import { getImageVariant, resolveVariant } from "@/images"

export const dynamic = "force-dynamic"

export const size = { width: 256, height: 256 }

function builtInIcon() {
  return new Response(null, {
    status: 307,
    headers: { Location: "/favicon.ico", "Cache-Control": "no-store" },
  })
}

export default async function Icon() {
  const icon = await getServerIcon()
  if (!icon) return builtInIcon()

  const image = await getImageBySha256(icon.sha256)
  if (!image) return builtInIcon()

  const variant = resolveVariant(size.width, image)
  const encoded = await getImageVariant(image, variant)
  if (!encoded) return builtInIcon()

  return new Response(new Uint8Array(encoded.data), {
    headers: {
      "Content-Type": encoded.mimeType,
      "Cache-Control": "public, max-age=60, must-revalidate",
      Etag: `"${image.sha256}-${variant}"`,
    },
  })
}
