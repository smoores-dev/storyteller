export function getCookieDomain(origin: string | null) {
  if (origin === null) {
    return undefined
  }

  const url = new URL(origin)
  return url.hostname
}
