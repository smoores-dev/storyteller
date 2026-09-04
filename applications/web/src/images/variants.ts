import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pid } from "node:process"

import { MediaType } from "@storyteller-platform/media-types"

import { IMAGE_CACHE_DIR } from "@/directories"

import { type EncodedImage, resizeToFit } from "./derive"
import { readImageBlob } from "./store"

export const SIZE_BUCKETS = [64, 128, 256, 384, 512, 768, 1024, 1536, 2048]

export const NATIVE_VARIANT = "native"

export const MAX_EDGE = 4096

export type ImageVariant = number | typeof NATIVE_VARIANT

export type VariantSource = {
  sha256: string
  mimeType: string
  width: number
  height: number
}

export function resolveVariant(
  requested: number | null | undefined,
  image: Pick<VariantSource, "width" | "height">,
): ImageVariant {
  const natural = Math.max(image.width, image.height)

  if (!requested || !Number.isFinite(requested) || requested <= 0) {
    return NATIVE_VARIANT
  }

  const bucket = SIZE_BUCKETS.find((size) => size >= requested)
  if (!bucket || bucket >= natural) return NATIVE_VARIANT

  return bucket
}

function variantEdge(variant: ImageVariant, image: VariantSource): number {
  if (variant !== NATIVE_VARIANT) return variant
  return Math.min(Math.max(image.width, image.height), MAX_EDGE)
}

function variantExtension(mimeType: string) {
  return mimeType === MediaType.AVIF.mime
    ? MediaType.AVIF.extension
    : MediaType.WEBP.extension
}

export function getVariantCacheDirectory(sha256: string) {
  return join(IMAGE_CACHE_DIR, sha256.slice(0, 2), sha256.slice(2, 4), sha256)
}

function getVariantCachePath(
  variant: ImageVariant,
  image: VariantSource,
): string {
  return join(
    getVariantCacheDirectory(image.sha256),
    `${variant}.${variantExtension(image.mimeType)}`,
  )
}

async function writeVariantCache(path: string, data: Buffer) {
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.${pid}.tmp`
  try {
    await writeFile(tmpPath, data)
    await rename(tmpPath, path)
  } catch {
    await rm(tmpPath, { force: true })
  }
}

export async function getImageVariant(
  image: VariantSource,
  variant: ImageVariant,
): Promise<EncodedImage | null> {
  const cachePath = getVariantCachePath(variant, image)
  const mimeType =
    image.mimeType === MediaType.AVIF.mime
      ? MediaType.AVIF.mime
      : MediaType.WEBP.mime

  try {
    return { data: await readFile(cachePath), mimeType }
  } catch {}

  const original = await readImageBlob(image.sha256)
  if (!original) return null

  const encoded = await resizeToFit(
    original,
    variantEdge(variant, image),
    image.mimeType,
  )

  await writeVariantCache(cachePath, encoded.data)

  return encoded
}

export async function deleteImageVariants(sha256: string): Promise<void> {
  await rm(getVariantCacheDirectory(sha256), { recursive: true, force: true })
}
