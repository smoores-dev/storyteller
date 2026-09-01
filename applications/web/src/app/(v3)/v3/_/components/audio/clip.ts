export type Clip = {
  bookUuid: string
  path: string
  name: string
  start?: number
  end?: number
  label: string
  sublabel?: string
}

function trim(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

export function clipSrc(clip: Clip): string {
  const path = clip.path.split("/").map(encodeURIComponent).join("/")
  const base = `/api/v2/books/${clip.bookUuid}/listen/${path}`
  if (clip.start === undefined && clip.end === undefined) return base
  const start = trim(Math.max(clip.start ?? 0, 0))
  if (clip.end === undefined) return `${base}#t=${start}`
  return `${base}#t=${start},${trim(clip.end)}`
}

export function clipKey(clip: Clip): string {
  return `${clip.bookUuid}|${clip.path}|${clip.start ?? ""}|${clip.end ?? ""}`
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, "0")
  if (hours === 0) return `${minutes}:${rest}`
  return `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
}
