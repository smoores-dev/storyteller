import { type CSSProperties } from "react"

import { type BookWithRelations } from "@/database/books"
import { type CoverFit } from "@/database/userPreferencesTypes"

export type BookCoverImage = NonNullable<
  NonNullable<BookWithRelations["ebook"]>["coverImage"]
>

export type CoverType = "ebook" | "audiobook"

export type ImageDimensions = { width: number; height: number }

// aspect is width / height, so smaller is taller
const ASPECT_LIMITS: Record<CoverType, { min: number; max: number }> = {
  // a book is never wider than it is tall
  ebook: { min: 1 / 2, max: 1 },
  // cd and record sleeves are square, with a little slack for odd art
  audiobook: { min: 1 / 2, max: 5 / 4 },
}

const NOMINAL_ASPECT: Record<CoverType, number> = {
  ebook: 2 / 3,
  audiobook: 1,
}

// the card grid's cover slot, used to decide which edge a true-size cover
// runs out of room on first
export const DEFAULT_SLOT_ASPECT = 13 / 16

// for a slot that constrains width but lets height grow, so the cover's width
// is always the edge that binds
export const WIDTH_BOUND_SLOT = 0

export function getAspectLimits(type: CoverType) {
  return ASPECT_LIMITS[type]
}

export function getNominalAspect(type: CoverType) {
  return NOMINAL_ASPECT[type]
}

export function imageAspect(
  image: ImageDimensions | null | undefined,
): number | null {
  if (!image?.width || !image.height) return null

  const aspect = image.width / image.height
  if (!Number.isFinite(aspect) || aspect <= 0) return null

  return aspect
}

/**
 * how far outside the displayable range an image sits, as the ratio between
 * its own aspect and the nearest allowed one. 1 means it fits.
 */
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

/**
 * size the cover to its own shape without letting it escape the slot it sits
 * in: whichever edge runs out of room first becomes the one that is pinned.
 */
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

export function getDevicePixelRatio() {
  return typeof window === "undefined"
    ? 1
    : Math.min(window.devicePixelRatio, 2)
}

export function coverSize(cssWidth: number, aspect: number) {
  const longestEdge = Math.max(cssWidth, cssWidth / aspect)
  return Math.round(longestEdge * getDevicePixelRatio())
}
