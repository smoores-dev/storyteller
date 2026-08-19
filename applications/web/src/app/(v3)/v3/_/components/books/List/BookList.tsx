"use client"

import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuSeparator,
} from "@v3/_/components/ui/filterable-menu"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { ActionEntryList } from "@/app/(v3)/v3/_/components/books/ActionMenu/BookActionMenuItems"
import {
  findScrollParent,
  useBookActionMenu,
} from "@/app/(v3)/v3/_/components/books/ActionMenu/useBookActionMenu"
import { SelectionBullet } from "@/app/(v3)/v3/_/components/books/SelectionCheckbox"
import {
  BOOK_COLLECTION_ID,
  type BookNavModel,
} from "@/app/(v3)/v3/_/components/books/keyboard-nav"
import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { type DisplayField, type SortContext } from "@/sort"

import { BookListItem, BookListItemSkeleton } from "./BookListItem"

type BookListProps = {
  books: BookWithRelations[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  showMuted: boolean
  emptyMessage?: string | undefined
  emptySubMessage?: string | undefined
  onClearFilters?: () => void
  hasActiveFilters?: boolean
  selectedBookUuid?: string | null
  onBookClick: (
    book: BookWithRelations,
    isSelecting: boolean,
    isBookSelected: boolean,
  ) => void
  displayFields?: DisplayField[]
  displayContext?: SortContext
  showThumbnail?: boolean
  navModel?: BookNavModel
}

export function BookList({
  books,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  showMuted,
  onClearFilters,
  hasActiveFilters,
  selectedBookUuid,
  onBookClick,
  displayFields = ["authors"],
  displayContext,
  showThumbnail = true,
  ...props
}: BookListProps) {
  const t = useTranslation("BookList")
  const menu = useBookActionMenu(books, "bulk")

  const emptyMessage = props.emptyMessage ?? t("emptyState")
  const emptySubMessage = props.emptySubMessage ?? t("emptyStateSub")

  const observerRef = useRef<ResizeObserver | null>(null)
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()

    if (!node) {
      observerRef.current = null
      return
    }

    setScrollElement(findScrollParent(node))

    const observer = new ResizeObserver(() => {})
    observer.observe(node)
    observerRef.current = observer
  }, [])

  const estimatedRowHeight = showThumbnail ? 58 : 40

  const rowVirtualizer = useVirtualizer({
    count: books.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimatedRowHeight,
    overscan: 8,
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
    useFlushSync: false,
    directDomUpdates: true,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()

  const lastVirtualRowIndex = virtualRows.at(-1)?.index

  const c = useCommon()
  const tActions = useTranslation("BookActions")

  useEffect(() => {
    if (lastVirtualRowIndex === undefined) return

    if (
      lastVirtualRowIndex >= books.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [
    lastVirtualRowIndex,
    books.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ])

  if (!isLoading && books.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[50vh] flex-col items-center justify-center gap-2">
        <icon.Search className="h-12 w-12 opacity-40" />
        <p className="text-lg font-medium">{emptyMessage}</p>
        {emptySubMessage && <p className="text-sm">{emptySubMessage}</p>}

        {hasActiveFilters && onClearFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            className="mt-2"
          >
            Clear Filters
          </Button>
        )}
      </div>
    )
  }

  return (
    <>
      {isLoading ? (
        <div className="flex flex-col gap-px py-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <BookListItemSkeleton key={i} showThumbnail={showThumbnail} />
          ))}
        </div>
      ) : (
        <div
          ref={containerRef}
          id={BOOK_COLLECTION_ID}
          aria-label="Books"
          className={cn(
            "animate-in fade-in-0 relative w-full py-4 transition-opacity duration-300 outline-none",
            showMuted && "opacity-60",
          )}
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {virtualRows.map((virtualRow) => {
            const book = books[virtualRow.index]
            if (!book) return null

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute top-1 left-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <BookListItem
                  book={book}
                  muted={showMuted}
                  handle={menu.handle}
                  selected={book.uuid === selectedBookUuid}
                  isSelecting={menu.isSelecting}
                  isBookSelected={
                    menu.selection?.isSelected(book.uuid) ?? false
                  }
                  onToggleSelection={menu.toggleSelection}
                  onSelectRange={menu.handleSelectRange}
                  onOpenMenu={menu.handleOpenMenu}
                  isMenuOpen={
                    menu.menuOpen && menu.menuBook?.uuid === book.uuid
                  }
                  onClick={onBookClick}
                  displayFields={displayFields}
                  displayContext={displayContext}
                  showThumbnail={showThumbnail}
                />
              </div>
            )
          })}
        </div>
      )}

      {isFetchingNextPage && (
        <div className="text-muted-foreground mt-4 flex items-center justify-center gap-2">
          <icon.LoaderIOSish className="h-5 w-5 animate-spin" />
          <span>Loading more...</span>
        </div>
      )}

      <FilterableMenu handle={menu.handle}>
        <FilterableMenuContent
          searchable
          searchPlaceholder={tActions.plain("search")}
          align="end"
          className="pointer-events-auto z-100 w-fit"
          onClose={() => {
            menu.handle.close()
          }}
        >
          {menu.toggleSelection && menu.menuBook && (
            <>
              <FilterableMenuItem
                icon={<SelectionBullet selected={menu.menuBookIsSelected} />}
                textValue={
                  menu.menuBookIsSelected
                    ? c.plain("actions.deselect")
                    : c.plain("actions.select")
                }
                onSelect={() => {
                  if (!menu.menuBook) return
                  menu.toggleSelection?.(menu.menuBook.uuid)
                }}
              >
                {menu.menuBookIsSelected
                  ? c("actions.deselect")
                  : c("actions.select")}
              </FilterableMenuItem>
              <FilterableMenuSeparator />
            </>
          )}

          <ActionEntryList entries={menu.menuEntries} />
        </FilterableMenuContent>
      </FilterableMenu>

      {menu.menuDialogs}
    </>
  )
}
