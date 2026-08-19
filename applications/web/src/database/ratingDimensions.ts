export type RatingDimension = { id: string; label: string }

export type RatingDimensionScores = Record<string, number>

export const RATING_DIMENSION_MIN = 0
export const RATING_DIMENSION_MAX = 5
export const RATING_DIMENSION_STEP = 1

export const DEFAULT_RATING_DIMENSIONS: RatingDimension[] = [
  { id: "plot", label: "Plot" },
  { id: "personal", label: "Personal" },
  { id: "pleasure", label: "Pleasure" },
  { id: "purpose", label: "Purpose" },
  { id: "prose", label: "Prose" },
]

export function isValidDimensionScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= RATING_DIMENSION_MIN &&
    value <= RATING_DIMENSION_MAX
  )
}

export function isValidDimensionScores(
  scores: unknown,
): scores is RatingDimensionScores {
  if (typeof scores !== "object" || scores === null || Array.isArray(scores)) {
    return false
  }
  return Object.values(scores as Record<string, unknown>).every(
    isValidDimensionScore,
  )
}

export function computeRatingAverage(
  scores: RatingDimensionScores | null | undefined,
): number | null {
  if (!scores) return null
  const values = Object.values(scores).filter(isValidDimensionScore)
  if (values.length === 0) return null
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  return Math.round(mean * 100) / 100
}

export function formatRating(value: number): string {
  return parseFloat(value.toFixed(2)).toString()
}
