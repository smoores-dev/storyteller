"use client"

import { useCallback, useRef, useState } from "react"

import { Badge } from "@v3/_/components/ui/badge"
import { cn } from "@v3/_/lib/utils"

import { type BookAlignmentReportView } from "@/alignmentReportView"
import { type AlignmentIgnoreOverride } from "@/database/alignmentReports"
import { useUpdateBookAlignmentOverridesMutation } from "@/store/api"

export type Tone = "positive" | "good" | "moderate" | "poor" | "info"

const TONE_BADGE: Record<Tone, string> = {
  positive:
    "bg-positive-bg text-positive dark:bg-positive-950/40 dark:text-positive-300",
  poor: "bg-poor-bg text-poor dark:bg-poor-950/40 dark:text-poor-300",
  moderate:
    "bg-moderate-bg text-moderate dark:bg-moderate-950/40 dark:text-moderate-300",
  info: "bg-highlight-bg text-highlight dark:bg-highlight-950/40 dark:text-highlight-300",
  good: "bg-good-bg text-good dark:bg-good-950/40 dark:text-good-300",
}

export function FlagBadge({
  tone = "info",
  className,
  children,
}: {
  tone?: Tone
  className?: string
  children: React.ReactNode
}) {
  return (
    <Badge className={cn("font-normal", TONE_BADGE[tone], className)}>
      {children}
    </Badge>
  )
}

export function shortHref(href: string): string {
  return (href.split("/").pop() ?? href).replace(/\.[^.]+$/, "")
}

export function useIgnoreEditor(view: BookAlignmentReportView) {
  const [update] = useUpdateBookAlignmentOverridesMutation()

  return useCallback(
    (keys: readonly string[], ignored: boolean) => {
      const wanted = new Set(keys)
      const chapters: Record<string, AlignmentIgnoreOverride> = {}
      const unalignedChapters: Record<string, AlignmentIgnoreOverride> = {}
      const audioFiles: Record<string, AlignmentIgnoreOverride> = {}

      for (const item of view.items) {
        const next = wanted.has(item.href) ? ignored : item.ignored
        if (!next) continue
        if (item.kind === "chapter") chapters[item.href] = { ignored: true }
        else unalignedChapters[item.href] = { ignored: true }
      }
      for (const file of view.audioFiles) {
        const next = wanted.has(file.filepath) ? ignored : file.ignored
        if (next) audioFiles[file.filepath] = { ignored: true }
      }

      void update({
        uuid: view.bookUuid,
        overrides: { chapters, unalignedChapters, audioFiles },
      })
    },
    [view, update],
  )
}

export type IgnoreEditor = ReturnType<typeof useIgnoreEditor>

export function useSelection() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  const anchor = useRef<string | null>(null)

  const toggle = useCallback(
    (key: string, order: readonly string[], extend: boolean) => {
      const from =
        extend && anchor.current !== null ? order.indexOf(anchor.current) : -1
      const to = order.indexOf(key)
      anchor.current = key
      setSelected((prev) => {
        const next = new Set(prev)
        if (from !== -1 && to !== -1) {
          const turningOn = !prev.has(key)
          for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
            const at = order[i]
            if (at === undefined) continue
            if (turningOn) next.add(at)
            else next.delete(at)
          }
          return next
        }
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    },
    [],
  )

  const setMany = useCallback((keys: readonly string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const key of keys) {
        if (on) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }, [])

  const clear = useCallback(() => {
    anchor.current = null
    setSelected(new Set<string>())
  }, [])

  return { selected, toggle, setMany, clear }
}

export type Selection = ReturnType<typeof useSelection>
