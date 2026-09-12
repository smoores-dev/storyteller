export function apiErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined

  if ("data" in error) {
    const data = error.data
    if (typeof data === "string" && data) return data
    if (data && typeof data === "object") {
      const body = data as { message?: unknown; error?: unknown }
      if (typeof body.message === "string" && body.message) return body.message
      if (typeof body.error === "string" && body.error) return body.error
    }
  }

  if ("error" in error) {
    const inner = error.error
    if (typeof inner === "string" && inner) return inner
  }

  if ("message" in error) {
    const message = error.message
    if (typeof message === "string" && message) return message
  }

  return undefined
}
