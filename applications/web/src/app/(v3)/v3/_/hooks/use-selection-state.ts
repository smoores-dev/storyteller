"use client"

import { useCallback, useMemo, useState } from "react"

import { type UUID } from "@/uuid"

// not per se uuids!
export type SelectionState<T extends string = UUID> = {
  selected: Set<T>
  lastSelectedId: T | null
  toggle: (id: T) => void
  selectRange: (targetId: T, orderedIds: T[]) => void
  selectAll: (ids: T[]) => void
  selectNone: () => void
  invert: (allIds: T[]) => void
  isSelected: (id: T) => boolean
  // clear both the selection and the anchor
  reset: () => void
}

export function useSelectionState<
  T extends string = UUID,
>(): SelectionState<T> {
  const [selected, setSelected] = useState<Set<T>>(new Set())
  const [lastSelectedId, setLastSelectedId] = useState<T | null>(null)

  const toggle = useCallback((id: T) => {
    setLastSelectedId(id)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectRange = useCallback(
    (targetId: T, orderedIds: T[]) => {
      const anchorId = lastSelectedId

      if (!anchorId) {
        setLastSelectedId(targetId)
        setSelected((prev) => new Set([...prev, targetId]))
        return
      }

      const anchorIdx = orderedIds.indexOf(anchorId)
      const targetIdx = orderedIds.indexOf(targetId)

      if (anchorIdx === -1 || targetIdx === -1) {
        setLastSelectedId(targetId)
        setSelected((prev) => new Set([...prev, targetId]))
        return
      }

      const from = Math.min(anchorIdx, targetIdx)
      const to = Math.max(anchorIdx, targetIdx)
      const rangeIds = orderedIds.slice(from, to + 1)

      setLastSelectedId(targetId)
      setSelected((prev) => {
        const anchorIsSelected = prev.has(anchorId)
        const next = new Set(prev)

        for (const id of rangeIds) {
          if (anchorIsSelected) {
            next.add(id)
          } else {
            next.delete(id)
          }
        }

        return next
      })
    },
    [lastSelectedId],
  )

  const selectAll = useCallback((ids: T[]) => {
    setSelected(new Set(ids))
  }, [])

  const selectNone = useCallback(() => {
    setSelected(new Set())
  }, [])

  const invert = useCallback((allIds: T[]) => {
    setSelected((prev) => new Set(allIds.filter((id) => !prev.has(id))))
  }, [])

  const isSelected = useCallback((id: T) => selected.has(id), [selected])

  const reset = useCallback(() => {
    setSelected(new Set())
    setLastSelectedId(null)
  }, [])

  return useMemo(
    () => ({
      selected,
      lastSelectedId,
      toggle,
      selectRange,
      selectAll,
      selectNone,
      invert,
      isSelected,
      reset,
    }),
    [
      selected,
      lastSelectedId,
      toggle,
      selectRange,
      selectAll,
      selectNone,
      invert,
      isSelected,
      reset,
    ],
  )
}
