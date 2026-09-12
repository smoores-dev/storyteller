"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type NavKey =
  | "ArrowRight"
  | "ArrowLeft"
  | "ArrowDown"
  | "ArrowUp"
  | "Home"
  | "End"

const NAV_KEYS: NavKey[] = [
  "ArrowRight",
  "ArrowLeft",
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
]

function isNavKey(key: string): key is NavKey {
  return (NAV_KEYS as string[]).includes(key)
}

export type GridNavigationOptions = {
  itemCount: number
  columns: number
  role?: string
  getItemId: (index: number) => string | undefined
  scrollToIndex?: (index: number) => void
  onActivate?: (index: number) => void
  onActiveChange?: (index: number) => void
  initialIndex?: () => number | null
  enabled?: boolean
}

export type GridNavigation = {
  activeIndex: number | null
  setActiveIndex: (index: number | null) => void
  isActive: (index: number) => boolean
  containerProps: {
    role: string
    tabIndex: number
    "aria-activedescendant": string | undefined
    onKeyDown: (event: React.KeyboardEvent) => void
    onFocus: (event: React.FocusEvent) => void
  }
}

export function useGridNavigation({
  itemCount,
  columns,
  role = "listbox",
  getItemId,
  scrollToIndex,
  onActivate,
  onActiveChange,
  initialIndex,
  enabled = true,
}: GridNavigationOptions): GridNavigation {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const cbRef = useRef({
    onActivate,
    onActiveChange,
    scrollToIndex,
    initialIndex,
  })
  cbRef.current = { onActivate, onActiveChange, scrollToIndex, initialIndex }

  useEffect(() => {
    setActiveIndex((current) => {
      if (current === null) return null
      if (itemCount === 0) return null
      return Math.min(current, itemCount - 1)
    })
  }, [itemCount])

  const move = useCallback(
    (next: number) => {
      if (itemCount === 0) return
      const clamped = Math.max(0, Math.min(itemCount - 1, next))
      setActiveIndex(clamped)
      cbRef.current.onActiveChange?.(clamped)
    },
    [itemCount],
  )

  useEffect(() => {
    if (activeIndex === null) return
    cbRef.current.scrollToIndex?.(activeIndex)
  }, [activeIndex])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!enabled || itemCount === 0) return
      if (event.target !== event.currentTarget) return

      const current = activeIndex

      if (current === null) {
        if (!isNavKey(event.key)) return
        event.preventDefault()
        const init = cbRef.current.initialIndex?.() ?? 0
        move(
          event.key === "End" ? itemCount - 1 : event.key === "Home" ? 0 : init,
        )
        return
      }

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault()
          move(current + 1)
          return
        case "ArrowLeft":
          event.preventDefault()
          move(current - 1)
          return
        case "ArrowDown":
          event.preventDefault()
          move(current + columns)
          return
        case "ArrowUp":
          event.preventDefault()
          move(current - columns)
          return
        case "Home":
          event.preventDefault()
          move(0)
          return
        case "End":
          event.preventDefault()
          move(itemCount - 1)
          return
        case "Enter":
        case " ":
          event.preventDefault()
          cbRef.current.onActivate?.(current)
          return
      }
    },
    [enabled, itemCount, activeIndex, columns, move],
  )

  const onFocus = useCallback(
    (event: React.FocusEvent) => {
      if (!enabled || itemCount === 0) return
      if (event.target !== event.currentTarget) return
      setActiveIndex((current) =>
        current !== null ? current : (cbRef.current.initialIndex?.() ?? 0),
      )
    },
    [enabled, itemCount],
  )

  const isActive = useCallback(
    (index: number) => index === activeIndex,
    [activeIndex],
  )

  return {
    activeIndex,
    setActiveIndex,
    isActive,
    containerProps: {
      role,
      tabIndex: 0,
      "aria-activedescendant":
        activeIndex !== null ? getItemId(activeIndex) : undefined,
      onKeyDown,
      onFocus,
    },
  }
}
