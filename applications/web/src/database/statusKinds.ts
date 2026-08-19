export const STATUS_TO_READ = "To read"
export const STATUS_READING = "Reading"
export const STATUS_READ = "Read"

export const WELL_KNOWN_STATUS_NAMES = new Set([
  STATUS_TO_READ,
  STATUS_READING,
  STATUS_READ,
])

export function isWellKnownStatus(name: string): boolean {
  return WELL_KNOWN_STATUS_NAMES.has(name)
}

export function statusDisplayLabel(status: {
  name: string
  label: string | null
}): string {
  return status.label ?? status.name
}
