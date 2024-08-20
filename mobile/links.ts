export function extractPath(href: string) {
  const url = new URL(href, "http://storyteller.local")
  return url.pathname
}

export function isSameChapter(href1: string, href2: string) {
  return extractPath(href1) === extractPath(href2)
}
