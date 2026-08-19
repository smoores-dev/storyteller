const ISO_PREFIX =
  /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?)?)?$/

export function toIsoDateString(value: unknown): string | null {
  if (value == null) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const match = ISO_PREFIX.exec(trimmed)
  if (!match) return null

  const [, year, month, day, hour, minute, second] = match
  const parsed = new Date(
    `${year}-${month ?? "01"}-${day ?? "01"}T${hour ?? "00"}:${minute ?? "00"}:${second ?? "00"}.000Z`,
  )
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toISOString()
}

export function toDateInputValue(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10)
  }
  if (typeof value !== "string") return ""
  const iso = toIsoDateString(value)
  return iso ? iso.slice(0, 10) : ""
}
