import { highlightHTML } from "@speed-highlight/core"
import { useEffect, useState } from "react"

import { cn } from "@/cn"
import { sanitizeHtml } from "@/sanitizeHtml"

import { CodeSkeleton } from "./CodeSkeleton"

export function Code({
  code,
  language,
  className,
  block = true,
}: {
  code: string
  language: string
  className?: string
  block?: boolean
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [highlightStatus, setHighlightStatus] = useState<
    "idle" | "loading" | "error" | "success"
  >("idle")

  useEffect(() => {
    let cancelled = false
    setHighlightStatus("loading")
    void highlightHTML(code, language, { block })
      .then((html) => {
        if (cancelled) return
        setHighlighted(sanitizeHtml(html))
        setHighlightStatus("success")
      })
      .catch(() => {
        if (!cancelled) setHighlightStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [code, language, block])

  return (
    <>
      {highlightStatus === "success" && highlighted && (
        <pre
          dangerouslySetInnerHTML={{ __html: highlighted }}
          className={cn("wrap-break-word whitespace-pre-wrap", className)}
        />
      )}
      {highlightStatus === "loading" && <CodeSkeleton />}
      {highlightStatus === "error" && (
        <pre className={cn("wrap-break-word whitespace-pre-wrap", className)}>
          {code}
        </pre>
      )}
    </>
  )
}
