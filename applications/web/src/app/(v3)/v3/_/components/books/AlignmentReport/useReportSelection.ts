"use no memo"

import { parseAsString, useQueryState } from "nuqs"
import { useCallback, useRef, useState } from "react"

export function useReportSelection() {
  const [openHref, setOpenHrefRaw] = useQueryState("chapter", parseAsString)
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const anchor = useRef<string | null>(null)

  const setOpenHref = useCallback(
    (href: string | null) => void setOpenHrefRaw(href),
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const toggleChecked = useCallback(
    (key: string, extend: boolean, order: readonly string[]) => {
      setChecked((previous) => {
        const next = new Set(previous)
        const from =
          anchor.current === null ? -1 : order.indexOf(anchor.current)
        const to = order.indexOf(key)
        if (extend && from >= 0 && to >= 0) {
          for (const item of order.slice(
            Math.min(from, to),
            Math.max(from, to) + 1,
          )) {
            next.add(item)
          }
          return next
        }
        if (next.has(key)) next.delete(key)
        else next.add(key)
        anchor.current = key
        return next
      })
    },
    [],
  )

  const setManyChecked = useCallback((keys: readonly string[], on: boolean) => {
    setChecked((previous) => {
      const next = new Set(previous)
      for (const key of keys) {
        if (on) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }, [])

  const clearChecked = useCallback(() => {
    setChecked(new Set())
    anchor.current = null
  }, [])

  return {
    openHref,
    setOpenHref,
    checked,
    toggleChecked,
    setManyChecked,
    clearChecked,
  }
}

export type ReportSelection = ReturnType<typeof useReportSelection>
