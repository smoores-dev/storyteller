export function getNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== "string") {
    return null
  }

  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return parsed
}
