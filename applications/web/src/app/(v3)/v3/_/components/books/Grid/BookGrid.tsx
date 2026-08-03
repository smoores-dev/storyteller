"use client"

import { useCallback, useMemo } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuSeparator,
} from "@v3/_/components/ui/filterable-menu"
import { useGridNavigation } from "@v3/_/hooks/use-grid-navigation"
import { useLayoutAnimations } from "@v3/_/hooks/use-layout-animations"
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { PANEL_SLIDE_DURATION } from "@v3/_/hooks/use-panel-width-driver"
import { cn } from "@v3/_/lib/utils"

import { ActionEntryList } from "@/app/(v3)/v3/_/components/books/ActionMenu/BookActionMenuItems"
import { useBookActionMenu } from "@/app/(v3)/v3/_/components/books/ActionMenu/useBookActionMenu"
import { CoverLoadProvider } from "@/app/(v3)/v3/_/components/books/Cover"
import { BookCard } from "@/app/(v3)/v3/_/components/books/Grid/BookCard"
import { BookCardSkeleton } from "@/app/(v3)/v3/_/components/books/Grid/BookCardSkeleton"
import { SelectionBullet } from "@/app/(v3)/v3/_/components/books/SelectionCheckbox"
import {
  BOOK_COLLECTION_ID,
  BOOK_DETAIL_PANEL_ID,
  type BookNavModel,
  bookItemDomId,
} from "@/app/(v3)/v3/_/components/books/keyboard-nav"
import { usePanelResize } from "@/app/(v3)/v3/_/components/books/panel-resize-context"
import { useBookInSidePanel } from "@/app/(v3)/v3/_/hooks/use-open-book"
import {
  useCommon,
  useTranslation,
} from "@/app/(v3)/v3/_/hooks/use-translation"
import {
  type VirtualGridGeometry,
  useVirtualGrid,
} from "@/app/(v3)/v3/_/hooks/use-virtual-grid"
import { type BookWithRelations } from "@/database/books"
import { type GridCardSize } from "@/database/userPreferencesTypes"
import * as icon from "@/icons"
import { type DisplayField, type SortContext, groupDisplayRows } from "@/sort"
import { useAppSelector } from "@/store/appState"
import {
  type GridSpacing,
  selectGridCardSize,
  selectGridSpacing,
} from "@/store/slices/uiSettingsSlice"

type BookGridProps = {
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
  onBookClick?: (
    book: BookWithRelations,
    isSelecting: boolean,
    isBookSelected: boolean,
  ) => void
  displayFields?: DisplayField[]
  displayContext?: SortContext
  // temporary: which keyboard-open model the grid uses (see LibraryPage toggle)
  navModel?: BookNavModel
}

export const GRID_CARD_WIDTHS: Record<GridCardSize, number> = {
  smallest: 130,
  small: 155,
  medium: 180,
  large: 220,
  largest: 270,
}
export const GRID_SPACING_PX: Record<GridSpacing, number> = {
  compact: 8,
  cozy: 16,
  spacious: 24,
}
const COVER_ASPECT = 16 / 13 // cover box is aspect-13/16 -> height = width * 16/13
const MOBILE_COLUMNS = 2

// meta height must be known up front (this virtualizer is uniform-cell and
// doesn't measure rows). estimate it from the rows the card renders (compact
// fields share a row): a 2-line title row plus one text line per other row.
// an empty field set renders no meta at all, so row gaps equal column gaps.
function metaHeightFor(fields: DisplayField[]): number {
  if (fields.length === 0) return 0
  const TOP = 8 // mt-2
  const TITLE = 40 // 2 lines, leading-tight
  const LINE = 20 // one text-xs line + gap-0.5
  const rows = groupDisplayRows(fields)
  const titleRows = rows.filter((row) => row[0] === "title").length
  return TOP + titleRows * TITLE + (rows.length - titleRows) * LINE
}

export function BookGrid({
  books: rawBooks,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  showMuted,
  onClearFilters,
  hasActiveFilters,
  selectedBookUuid,
  onBookClick,
  displayFields,
  displayContext,
  navModel = "commit",
  ...props
}: BookGridProps) {
  const books = rawBooks

  const t = useTranslation("BookList")
  const menu = useBookActionMenu(books, "bulk")

  const emptyMessage = props.emptyMessage ?? t("emptyState")
  const emptySubMessage = props.emptySubMessage ?? t("emptyStateSub")

  const isMobile = useIsMobile()
  const gridCardSize = useAppSelector(selectGridCardSize)
  const cardWidth = GRID_CARD_WIDTHS[gridCardSize]
  const gridGap = GRID_SPACING_PX[useAppSelector(selectGridSpacing)]

  // animated mode: fluid 1fr cards + FLIP re-wraps. fallback (reduced motion or
  // the preference off): fluid cards that reflow instantly (no FLIP).
  const animate = useLayoutAnimations() && !isMobile

  const metaHeight = useMemo(
    () => metaHeightFor(displayFields ?? ["authors", "title"]),
    [displayFields],
  )

  const geometry = useMemo<VirtualGridGeometry>(
    () => ({
      minColumnWidth: cardWidth,
      gapX: gridGap,
      gapY: gridGap,
      padX: 0,
      padY: 4,
      rowHeightForColumnWidth: (w) => w * COVER_ASPECT + metaHeight,
      ...(isMobile ? { fixedColumns: MOBILE_COLUMNS } : {}),
    }),
    [cardWidth, gridGap, metaHeight, isMobile],
  )

  // pin the selected card across reflows (panel open, resize, card-size change)
  const anchorIndex = useMemo(() => {
    if (!selectedBookUuid) return null
    const i = books.findIndex((b) => b.uuid === selectedBookUuid)
    return i >= 0 ? i : null
  }, [books, selectedBookUuid])

  // panel drag and open/close want immediate column reflow; untracked width
  // changes keep the settle-then-reflow. during an open/close slide the FLIP
  // matches the panel's transform timing so both read as one motion.
  const panelResize = usePanelResize()

  const grid = useVirtualGrid({
    itemCount: books.length,
    geometry,
    anchorIndex,
    animate,
    flipDuration: panelResize.sliding ? PANEL_SLIDE_DURATION : 500,
    hasNextPage,
    isFetchingNextPage,
    onFetchNextPage: fetchNextPage,
    deferCoverLoads: true,
    overscanRows: 4,
    liveResize: panelResize.live,
    pendingWidthDelta: panelResize.pendingWidthDelta,
  })

  // revisit
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const navEnabled = false as boolean // !!onBookClick

  const { setSelectedBookUuid } = useBookInSidePanel()

  const openBookAt = useCallback(
    (index: number) => {
      const book = books[index]
      void setSelectedBookUuid(book?.uuid ?? null)
      // if (book) onBookClick?.(book)
    },
    [books, setSelectedBookUuid],
  )

  const focusDetailPanel = useCallback(() => {
    requestAnimationFrame(() => {
      document.getElementById(BOOK_DETAIL_PANEL_ID)?.focus()
    })
  }, [])

  const scrollToIndex = grid.scrollToIndex
  const nav = useGridNavigation({
    itemCount: books.length,
    columns: grid.metrics.cols || 1,
    enabled: navEnabled,
    getItemId: (index) => {
      const book = books[index]
      return book ? bookItemDomId(book.uuid) : undefined
    },
    scrollToIndex,
    initialIndex: () => {
      const i = books.findIndex((b) => b.uuid === selectedBookUuid)
      return i >= 0 ? i : 0
    },
    // preview model opens the book as the cursor moves; commit model only
    // highlights until Enter.
    onActiveChange:
      navModel === "preview"
        ? (index) => {
            openBookAt(index)
          }
        : undefined,
    onActivate: (index) => {
      openBookAt(index)
      focusDetailPanel()
    },
  })

  const activeUuid =
    nav.activeIndex !== null ? books[nav.activeIndex]?.uuid ?? null : null

  const c = useCommon()
  const tActions = useTranslation("BookActions")

  if (isLoading) {
    return (
      <div
        className="grid w-full"
        style={{
          gap: gridGap,
          gridTemplateColumns: isMobile
            ? `repeat(${MOBILE_COLUMNS}, minmax(0, 1fr))`
            : `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
        }}
      >
        {Array.from({ length: 40 }).map((_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (books.length === 0) {
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

  const visible = books.slice(grid.startIndex, grid.endIndex)

  return (
    <>
      <div
        ref={grid.sizerRef}
        id={BOOK_COLLECTION_ID}
        aria-label="Books"
        {...(navEnabled ? nav.containerProps : {})}
        className={cn(
          "relative w-full max-w-[100cqw] transition-opacity duration-200 outline-none",
          showMuted && "opacity-60",
        )}
        style={grid.sizerStyle}
      >
        <CoverLoadProvider value={grid.imagesActive}>
          <div ref={grid.gridRef} style={grid.gridStyle}>
            {visible.map((book, i) => {
              const index = grid.startIndex + i
              return (
                <BookCard
                  key={book.uuid}
                  index={index}
                  book={book}
                  coverWidth={cardWidth}
                  muted={showMuted}
                  keyboardNav={navEnabled}
                  active={navEnabled && book.uuid === activeUuid}
                  selected={book.uuid === selectedBookUuid}
                  isSelecting={menu.isSelecting}
                  isBookSelected={
                    menu.selection?.isSelected(book.uuid) ?? false
                  }
                  onToggleSelection={menu.toggleSelection}
                  onOpenMenu={menu.handleOpenMenu}
                  onClick={onBookClick}
                  handle={menu.handle}
                  displayFields={displayFields}
                  displayContext={displayContext}
                  onSelectRange={menu.handleSelectRange}
                />
              )
            })}
          </div>
        </CoverLoadProvider>
      </div>

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
          className="pointer-events-auto z-100 min-w-44"
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
