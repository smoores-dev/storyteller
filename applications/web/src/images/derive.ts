import { encode } from "blurhash"

import * as okmain from "@storyteller-platform/okmain"
import { InputImage } from "@storyteller-platform/okmain"

import { type StoredCoverColor } from "@/database/coverColors"
import { env } from "@/env"

let _sharp: typeof import("sharp") | undefined

export const AVIF = "image/avif"
export const WEBP = "image/webp"

export async function getSharp() {
  if (_sharp) {
    return _sharp
  }
  _sharp = (await import("sharp")).default
  if (_sharp.concurrency() > 1) {
    const divisor = env.NODE_ENV === "development" ? 4 : 2
    _sharp.concurrency(Math.floor(Math.max(_sharp.concurrency() / divisor, 1)))
  }
  return _sharp
}

const FORMAT_MIME_TYPES: Record<string, string> = {
  avif: AVIF,
  gif: "image/gif",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jp2: "image/jp2",
  png: "image/png",
  svg: "image/svg+xml",
  tiff: "image/tiff",
  webp: WEBP,
}

export type ProbedImage = {
  mimeType: string
  width: number
  height: number
}

export async function probeImage(
  data: Buffer | Uint8Array,
): Promise<ProbedImage | null> {
  try {
    const sharp = await getSharp()
    const metadata = await sharp(data).metadata()

    const mimeType = FORMAT_MIME_TYPES[metadata.format]
    if (!mimeType) return null

    const { width, height } = metadata
    if (!width || !height) return null

    return { mimeType, width, height }
  } catch {
    return null
  }
}

export type EncodedImage = {
  data: Buffer
  mimeType: string
}

export async function resizeToFit(
  data: Buffer | Uint8Array,
  longestEdge: number,
  sourceMimeType: string,
): Promise<EncodedImage> {
  const sharp = await getSharp()
  const transformer = sharp(data)
    .timeout({ seconds: 7 })
    .resize(longestEdge, longestEdge, {
      fit: "inside",
      withoutEnlargement: true,
    })

  const quality = 75

  if (sourceMimeType === AVIF) {
    transformer.avif({ quality: Math.max(quality - 20, 1), effort: 1 })
    return { data: await transformer.toBuffer(), mimeType: AVIF }
  }

  transformer.webp({ quality })
  return { data: await transformer.toBuffer(), mimeType: WEBP }
}

export async function generateBlurhash(
  data: Buffer | Uint8Array,
): Promise<string | null> {
  try {
    const sharp = await getSharp()

    const { data: pixels, info } = await sharp(data)
      .resize(64, 64, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    return encode(new Uint8ClampedArray(pixels), info.width, info.height, 4, 3)
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

export function getCoverColors(imageData: Buffer): StoredCoverColor[] | null {
  try {
    const input = InputImage.fromImage(imageData)

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
