"use client"

import { Popover } from "@base-ui/react/popover"
import { useCallback, useMemo, useState } from "react"

import { useOptionalBookSelection } from "@v3/_/hooks/use-book-selection"

import { type BookWithRelations } from "@/database/books"
import { type UUID } from "@/uuid"

import { useBookActionItems } from "./BookActionMenuItems"

export function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null

  while (el) {
    const overflowY = getComputedStyle(el).overflowY
    if (overflowY === "auto" || overflowY === "scroll") return el
    el = el.parentElement
  }

  return null
}

export function useBookActionMenu(
  books: BookWithRelations[],
  mode: "single" | "bulk" = "single",
) {
  const selection = useOptionalBookSelection()
  const isSelecting = selection?.isSelecting ?? false
  const toggleSelection = selection?.toggleSelection

  const orderedUuids = useMemo(() => books.map((b) => b.uuid), [books])

  const handleSelectRange = useCallback(
    (uuid: UUID) => {
      selection?.selectRange(uuid, orderedUuids)
    },
    [selection, orderedUuids],
  )

  const handle = useMemo(() => Popover.createHandle(), [])
  const [menuBook, setMenuBook] = useState<BookWithRelations | null>(null)

  const handleOpenMenu = useCallback((book: BookWithRelations) => {
    setMenuBook(book)
  }, [])

  const { entries: menuEntries, dialogs: menuDialogs } = useBookActionItems({
    books: menuBook ? [menuBook] : [],
    mode,
  })

  const menuBookIsSelected = menuBook
    ? selection?.isSelected(menuBook.uuid) ?? false
    : false

  return {
    selection,
    isSelecting,
    toggleSelection,
    handleSelectRange,
    menuOpen: handle.isOpen,
    menuBook,
    handle,
    handleOpenMenu,
    menuEntries,
    menuDialogs,
    menuBookIsSelected,
  }
}
