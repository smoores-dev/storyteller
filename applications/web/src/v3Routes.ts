// we do this bc the proxy middleware in next.config.ts cannot handle absolute urls, which is a problem when the server is bound to 127.0.0.1 and behind a tls proxy like tailscale serve.

export const V3_ROOTS = [
  "books",
  "series",
  "authors",
  "narrators",
  "translators",
  "tags",
  "publication-years",
  "ratings",
  "statuses",
  "collections",
  "settings",
  "login",
  "init",
  "preferences",
  "shelves",
  "formats",
  "quality",
  "identifiers",
  "not-found",
  "test",
  "theme",
]

export const V2_ONLY_PATTERNS = [/^\/books\/[^/]+\/read$/]

export function hasV3Route(pathname: string): boolean {
  if (V2_ONLY_PATTERNS.some((pattern) => pattern.test(pathname))) return false

  if (pathname === "/") return true

  return V3_ROOTS.some(
    (root) => pathname === `/${root}` || pathname.startsWith(`/${root}/`),
  )
}
