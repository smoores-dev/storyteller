"use client"

import { type RefObject, useEffect, useState } from "react"

export const NARROW_WIDTH = 720

export function useNarrow(ref: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined) setNarrow(width < NARROW_WIDTH)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [ref])

  return narrow
}
