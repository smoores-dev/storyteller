"use client"

import { useMemo } from "react"

import { useSelectionState } from "@v3/_/hooks/use-selection-state"

export type ItemSelectionState = {
  selectedItems: Set<string>
  isSelecting: boolean
  toggleItem: (key: string) => void
  selectRange: (targetKey: string, orderedKeys: string[]) => void
  selectAll: (keys: string[]) => void
  selectNone: () => void
  isSelected: (key: string) => boolean
  stopSelecting: () => void
}

export function useItemSelection(): ItemSelectionState {
  const selection = useSelectionState<string>()

  const isSelecting = selection.selected.size > 0

  return useMemo(
    () => ({
      selectedItems: selection.selected,
      isSelecting,
      toggleItem: selection.toggle,
      selectRange: selection.selectRange,
      selectAll: selection.selectAll,
      selectNone: selection.selectNone,
      isSelected: selection.isSelected,
      stopSelecting: selection.reset,
    }),
    [selection, isSelecting],
  )
}
