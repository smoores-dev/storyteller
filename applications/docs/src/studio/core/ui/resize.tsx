import React, { useCallback, useEffect, useRef, useState } from "react"

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function usePaneSize(
  key: string,
  initial: number,
  min: number,
  max: number,
) {
  const [size, setSize] = useState(initial)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      const parsed = raw === null ? Number.NaN : Number(raw)
      if (Number.isFinite(parsed)) {
        setSize(clamp(parsed, min, max))
      }
    } catch {
      return
    }
  }, [key, min, max])
  const change = useCallback(
    (next: number) => setSize(clamp(next, min, max)),
    [min, max],
  )
  const commit = useCallback(
    (next: number) => {
      const value = clamp(next, min, max)
      setSize(value)
      try {
        localStorage.setItem(key, String(value))
      } catch {
        return
      }
    },
    [key, min, max],
  )
  const reset = useCallback(() => {
    setSize(initial)
    try {
      localStorage.removeItem(key)
    } catch {
      return
    }
  }, [key, initial])
  return { size, change, commit, reset }
}

export function ResizeHandle({
  value,
  step,
  scale,
  label,
  invert = false,
  onChange,
  onCommit,
  onReset,
  className = "",
}: {
  value: number
  step: number
  scale: "pixels" | "share"
  label: string
  invert?: boolean
  onChange: (next: number) => void
  onCommit: (next: number) => void
  onReset: () => void
  className?: string
}) {
  const drag = useRef<{
    startX: number
    startValue: number
    width: number
    latest: number
  } | null>(null)
  const [active, setActive] = useState(false)
  const direction = invert ? -1 : 1
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(scale === "share" ? value * 100 : value)}
      tabIndex={0}
      title="Drag to resize, double click to reset"
      className={`group relative z-10 w-1.5 shrink-0 cursor-col-resize touch-none outline-none max-md:hidden ${className}`}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        const parent = event.currentTarget.parentElement
        drag.current = {
          startX: event.clientX,
          startValue: value,
          width: Math.max(parent?.getBoundingClientRect().width ?? 1, 1),
          latest: value,
        }
        setActive(true)
      }}
      onPointerMove={(event) => {
        const state = drag.current
        if (!state) {
          return
        }

        const delta = (event.clientX - state.startX) * direction
        const next =
          scale === "share"
            ? state.startValue + delta / state.width
            : state.startValue + delta
        state.latest = next
        onChange(next)
      }}
      onPointerUp={(event) => {
        const state = drag.current
        drag.current = null
        setActive(false)
        event.currentTarget.releasePointerCapture(event.pointerId)
        if (state) {
          onCommit(state.latest)
        }
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return
        }

        event.preventDefault()
        const sign = (event.key === "ArrowRight" ? 1 : -1) * direction
        const size = event.shiftKey ? step * 4 : step
        onCommit(value + sign * size)
      }}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${active ? "bg-primary" : "bg-line group-hover:bg-primary group-focus-visible:bg-primary"}`}
      />
    </div>
  )
}
