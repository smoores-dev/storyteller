export function getCookieDomain(origin: string | null) {
  if (origin === null) {
    return undefined
  }

  const url = new URL(origin)
  return url.hostname
}

export function getCookieSecure(origin: string | null) {
  if (origin === null) {
    return false
  }

  const url = new URL(origin)
  return url.protocol === "https:"
}
