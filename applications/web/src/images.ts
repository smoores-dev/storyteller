import { encode } from "blurhash"

import * as okmain from "@storyteller-platform/okmain"
import { InputImage } from "@storyteller-platform/okmain"

import { type StoredCoverColor } from "./database/coverColors"
import { env } from "./env"

let _sharp: typeof import("sharp") | undefined

const AVIF = "image/avif"
const WEBP = "image/webp"
const _JPEG = "image/jpeg"

async function getSharp() {
  if (_sharp) {
    return _sharp
  }
  _sharp = (await import("sharp")).default
  if (_sharp.concurrency() > 1) {
    // Reducing concurrency should reduce the memory usage too.
    // We more aggressively reduce in dev but also reduce in prod.
    // https://sharp.pixelplumbing.com/api-utility#concurrency
    const divisor = env.NODE_ENV === "development" ? 4 : 2
    _sharp.concurrency(Math.floor(Math.max(_sharp.concurrency() / divisor, 1)))
  }
  return _sharp
}

export type OptimizedImage = {
  data: Buffer
  mimeType: string
}

export async function optimizeImage({
  buffer,
  contentType,
  width,
  height,
}: {
  buffer: Buffer
  contentType: string
  width: number
  height?: number
}): Promise<OptimizedImage> {
  height = height && Math.round(height * 2)
  width = Math.round(width * 2)

  const quality = 75
  const sharp = await getSharp()

  const transformer = sharp(buffer).timeout({ seconds: 7 })

  if (height) {
    transformer.resize(width, height)
  } else {
    transformer.resize(width, undefined, {
      withoutEnlargement: true,
    })
  }

  // png covers are common in epubs but png encoding is slow for
  // photographic content; output jpeg instead since the result is cached
  let outputMimeType = contentType

  if (contentType === AVIF) {
    transformer.avif({
      quality: Math.max(quality - 20, 1),
      effort: 1,
    })
  } else {
    //if (contentType === WEBP) {
    transformer.webp({ quality })
    outputMimeType = WEBP
    // } else {
    //   transformer.jpeg({ quality })
    //   outputMimeType = JPEG
  }

  const data = await transformer.toBuffer()

  return { data, mimeType: outputMimeType }
}

export async function generateBlurhash(
  imageData: Buffer | Uint8Array,
  type: "ebook" | "audiobook",
): Promise<string | null> {
  try {
    const sharp = await getSharp()

    const { data, info } = await sharp(imageData)
      .resize(type === "ebook" ? 64 : 32, 32, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3)
  } catch {
    return null
  }
}

type ColorsDetailedFn = (input: InputImage) => {
  r: number
  g: number
  b: number
  fraction: number
  chroma: number
  score: number
}[]

const round3 = (n: number) => Math.round(n * 1000) / 1000

export function getCoverColors(
  imageData: Buffer,
  // type: "ebook" | "audiobook",
): StoredCoverColor[] | null {
  try {
    const input = InputImage.fromImage(imageData)

    // colorsDetailed ships in okmain >= 0.2.5; the feature-detect keeps the
    // currently pinned older build working until the new version is published
    const detailed = (okmain as { colorsDetailed?: ColorsDetailedFn })
      .colorsDetailed
    if (detailed) {
      return detailed(input).map(({ r, g, b, fraction, chroma }) => ({
        r,
        g,
        b,
        fraction: round3(fraction),
        chroma: round3(chroma),
      }))
    }

    return okmain.colors(input)
  } catch {
    return null
  }
}
