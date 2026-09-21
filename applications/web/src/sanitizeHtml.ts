import DOMPurify from "dompurify"
import { useMemo, useSyncExternalStore } from "react"

export function sanitizeHtml(html: string): string {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

const never = () => () => {}

export function useSanitizedHtml(
  html: string | null | undefined,
): string | undefined {
  const hydrated = useSyncExternalStore(
    never,
    () => true,
    () => false,
  )
  return useMemo(
    () => (hydrated && html ? sanitizeHtml(html) : undefined),
    [hydrated, html],
  )
}
