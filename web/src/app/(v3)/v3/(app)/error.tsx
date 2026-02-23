"use client"

import { ErrorDisplay } from "@v3/_/error/error-display"

export default function Error({
  error,
  //   reset,
}: {
  error: Error & { digest?: string }
  //   reset: () => void
}) {
  return <ErrorDisplay error={error} />
}
