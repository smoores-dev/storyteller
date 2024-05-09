/**
 * Safely join URL path components.
 *
 * Will preserve trailing and ending slashes, and
 * ensure that slashes between components are not
 * doubled or missing.
 *
 * Usage:
 *
 * `joinUrlPaths("/", "/token")` -> `"/token"'
 * `joinUrlPaths("", "a", "b", "", "/c")` -> `"a/b/c"'
 * `joinUrlPaths("/some", "path/")` -> `"/some/path/"'
 */
export function joinUrlPaths(...components: string[]): string {
  if (!components.length) return ""
  if (components.length === 1) return components[0]!

  const hasEndingSlash = components[components.length - 1]!.endsWith("/")
  const hasStartingSlash = components[0]!.startsWith("/")

  const joinedComponents = components
    .map((component) => {
      let trimmed = component
      if (trimmed.startsWith("/")) {
        trimmed = trimmed.slice(1)
      }
      if (trimmed.endsWith("/")) {
        trimmed = trimmed.slice(0, trimmed.length - 1)
      }
      return trimmed
    })
    .filter((component) => component !== "")
    .join("/")

  if (joinedComponents === "") {
    return hasStartingSlash || hasEndingSlash ? "/" : ""
  }

  return (
    (hasStartingSlash ? "/" : "") +
    joinedComponents +
    (hasEndingSlash ? "/" : "")
  )
}
