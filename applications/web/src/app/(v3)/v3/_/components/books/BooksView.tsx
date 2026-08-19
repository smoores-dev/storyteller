"use client"

import { BookGrid } from "@/app/(v3)/v3/_/components/books/Grid/BookGrid"
import { BookList } from "@/app/(v3)/v3/_/components/books/List/BookList"
import { BookTable } from "@/app/(v3)/v3/_/components/books/List/BookTable"
import { useIsMobile } from "@/app/(v3)/v3/_/hooks/use-mobile"
import { type BookWithRelations } from "@/database/books"
import {
  type DisplayField,
  type SortContext,
  type SortDirection,
  type SortField,
} from "@/sort"
import { useAppSelector } from "@/store/appState"
import {
  type BookLayout,
  selectBookLayout,
  selectGridView,
  selectListDisplayFields,
  selectListShowThumbnail,
  selectListView,
} from "@/store/slices/uiSettingsSlice"

type BooksViewProps = {
  books: BookWithRelations[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  showMuted: boolean
  emptyMessage?: string
  emptySubMessage?: string | undefined
  onClearFilters?: () => void
  hasActiveFilters?: boolean
  selectedBookUuid?: string | null
  onBookClick: (
    book: BookWithRelations,
    isSelecting: boolean,
    isBookSelected: boolean,
  ) => void
  onColumnClick?: (book: BookWithRelations, field: DisplayField) => void
  displayFields?: DisplayField[]
  listDisplayFieldsOverride?: DisplayField[]
  displayContext?: SortContext
  sortField?: SortField
  sortDirection?: SortDirection
  onSortChange?: (field: SortField, direction: SortDirection) => void
  forceLayout?: BookLayout
}

export function BooksView({
  displayFields,
  listDisplayFieldsOverride,
  onBookClick,
  onColumnClick,
  sortField,
  sortDirection,
  onSortChange,
  forceLayout,
  ...shared
}: BooksViewProps) {
  const storedLayout = useAppSelector(selectBookLayout)
  const gridView = useAppSelector(selectGridView)
  const listView = useAppSelector(selectListView)
  const listDisplayFieldsPref = useAppSelector(selectListDisplayFields)
  const listShowThumbnail = useAppSelector(selectListShowThumbnail)
  const isMobile = useIsMobile()

  const layout = forceLayout ?? storedLayout
  const listDisplayFields = listDisplayFieldsOverride ?? listDisplayFieldsPref
  const resolvedListView = isMobile && listView === "table" ? "list" : listView

  if (layout === "list") {
    return (
      <div className="max-w-[calc(100%-var(--panel-reveal,0px))]">
        {resolvedListView === "table" ? (
          <BookTable
            {...shared}
            onBookClick={onBookClick}
            onColumnClick={onColumnClick}
            columns={listDisplayFields}
            showThumbnail={listShowThumbnail}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
          />
        ) : (
          <BookList
            {...shared}
            onBookClick={onBookClick}
            displayFields={listDisplayFields}
            showThumbnail={listShowThumbnail}
          />
        )}
      </div>
    )
  }

  return (
    <BookGrid
      {...shared}
      onBookClick={onBookClick}
      displayFields={gridView === "thumbnail" ? [] : displayFields}
    />
  )
}
