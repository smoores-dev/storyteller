import { type CSSProperties } from "react"

import { type BookWithRelations } from "@/database/books"
import { type CoverFit } from "@/database/userPreferencesTypes"

export type BookCoverImage = NonNullable<
  NonNullable<BookWithRelations["ebook"]>["cover"]
>

export type CoverType = "ebook" | "audiobook"

export type ImageDimensions = { width: number; height: number }

const ASPECT_LIMITS: Record<CoverType, { min: number; max: number }> = {
  ebook: { min: 1 / 2, max: 1 },
  audiobook: { min: 1 / 2, max: 5 / 4 },
}

const NOMINAL_ASPECT: Record<CoverType, number> = {
  ebook: 2 / 3,
  audiobook: 1,
}

export const DEFAULT_SLOT_ASPECT = 13 / 16

export const WIDTH_BOUND_SLOT = 0

export function imageAspect(
  image: ImageDimensions | null | undefined,
): number | null {
  if (!image?.width || !image.height) return null

  const aspect = image.width / image.height
  if (!Number.isFinite(aspect) || aspect <= 0) return null

  return aspect
}

export function aspectOvershoot(
  image: ImageDimensions | null | undefined,
  type: CoverType,
): number {
  const aspect = imageAspect(image)
  if (aspect === null) return 1

  const { min, max } = ASPECT_LIMITS[type]
  if (aspect > max) return aspect / max
  if (aspect < min) return min / aspect
  return 1
}

export function coverBoxAspect(
  fit: CoverFit,
  type: CoverType,
  image: ImageDimensions | null | undefined,
): number {
  if (fit !== "true-size") return NOMINAL_ASPECT[type]

  const aspect = imageAspect(image)
  if (aspect === null) return NOMINAL_ASPECT[type]

  const { min, max } = ASPECT_LIMITS[type]
  return Math.min(Math.max(aspect, min), max)
}

export function coverBoxStyle(
  boxAspect: number,
  slotAspect: number,
  extent: { width: string; height: string } = { width: "100%", height: "100%" },
): CSSProperties {
  return boxAspect <= slotAspect
    ? { aspectRatio: `${boxAspect}`, height: extent.height, width: "auto" }
    : { aspectRatio: `${boxAspect}`, width: extent.width, height: "auto" }
}

export function coverObjectFitClass(fit: CoverFit) {
  switch (fit) {
    case "stretch":
      return "object-fill"
    case "contain":
      return "object-contain"
    case "cover":
    case "true-size":
      return "object-cover"
  }
}

export function coverSize(cssWidth: number, aspect: number) {
  const longestEdge = Math.max(cssWidth, cssWidth / aspect)
  return Math.round(longestEdge)
}
