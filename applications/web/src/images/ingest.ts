import { type StoredCoverColor } from "@/database/coverColors"
import { type Image, getImageBySha256, insertImage } from "@/database/images"

import { generateBlurhash, getCoverColors, probeImage } from "./derive"
import { hashImage, imageBlobExists, writeImageBlob } from "./store"

export type IngestOptions = {
  sourceName?: string | null
  derived?: {
    blurhash: string | null
    colors: StoredCoverColor[] | null
  }
}

export async function ingestImage(
  data: Buffer | Uint8Array,
  options: IngestOptions = {},
): Promise<Image | null> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const sha256 = hashImage(buffer)

  const existing = await getImageBySha256(sha256)
  if (existing) {
    if (!(await imageBlobExists(sha256))) {
      await writeImageBlob(sha256, buffer)
    }
    return existing
  }

  const probed = await probeImage(buffer)
  if (!probed) return null

  await writeImageBlob(sha256, buffer)

  const derived = options.derived ?? {
    blurhash: await generateBlurhash(buffer),
    colors: getCoverColors(buffer),
  }

  return await insertImage({
    sha256,
    mimeType: probed.mimeType,
    width: probed.width,
    height: probed.height,
    byteSize: buffer.byteLength,
    blurhash: derived.blurhash,
    colors: derived.colors,
    sourceName: options.sourceName ?? null,
  })
}
