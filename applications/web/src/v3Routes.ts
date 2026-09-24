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
  "forgot-password",
  "reset-password",
  "invites",
  "device",
  "preferences",
  "shelves",
  "formats",
  "quality",
  "identifiers",
  "not-found",
  "test",
  "theme",
]

export function hasV3Route(pathname: string): boolean {
  if (pathname === "/") return true

  return V3_ROOTS.some(
    (root) => pathname === `/${root}` || pathname.startsWith(`/${root}/`),
  )
}
