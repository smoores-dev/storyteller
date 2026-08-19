export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = (error as { code?: unknown }).code
  return typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")
}
