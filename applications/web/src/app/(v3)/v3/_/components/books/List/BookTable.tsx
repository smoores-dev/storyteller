"use client"

import { Popover } from "@base-ui/react/popover"
import {
  type Cell,
  type Column,
  type ColumnDef,
  FlexRender,
  type Header,
  type SortingState,
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  functionalUpdate,
  metaHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Reorder, useDragControls } from "motion/react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { shallowEqual } from "react-redux"

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
import { Cover } from "@/app/(v3)/v3/_/components/books/Cover"
import { useCoverScope } from "@/app/(v3)/v3/_/components/books/CoverScope"
import {
  MissingBadge,
  hasMissingMedia,
} from "@/app/(v3)/v3/_/components/books/MissingBadge"
import { ProcessingIndicator } from "@/app/(v3)/v3/_/components/books/ProcessingIndicator"
import {
  SelectionBullet,
  SelectionCheckbox,
} from "@/app/(v3)/v3/_/components/books/SelectionCheckbox"
import { BOOK_COLLECTION_ID } from "@/app/(v3)/v3/_/components/books/keyboard-nav"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/(v3)/v3/_/components/ui/table"
import { V3Link } from "@/app/(v3)/v3/_/components/v3-link"
import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { type BookWithRelations } from "@/database/books"
import { getFieldDef } from "@/fields"
import * as icon from "@/icons"
import { type DisplayField, type SortDirection, type SortField } from "@/sort"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectShowMissingBadge,
  selectShowProcessingBadge,
  selectShowReadaloudBadge,
  selectTableColumnOrder,
  selectTableColumnWidths,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"
import { type UUID } from "@/uuid"

import { ColumnValue, columnWidths } from "./BookListColumns"

type BookTableProps = {
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
  onColumnClick?: (book: BookWithRelations, field: DisplayField) => void
  columns: DisplayField[]
  showThumbnail?: boolean
  sortField?: SortField
  sortDirection?: SortDirection
  onSortChange?: (field: SortField, direction: SortDirection) => void
}

const MIN_COLUMN_WIDTH = 48
const MIN_TITLE_WIDTH = 160
const MAX_AUTOFIT_WIDTH = 480
const KEYBOARD_RESIZE_STEP = 8
const HEADER_ICON_SIZE = 12
const HEADER_LABEL_GAP = 4
const HEADER_CHEVRON_GAP = 2

type BookColumnKind = "select" | "title" | "data" | "spacer" | "actions"

type BookColumnMeta = {
  kind: BookColumnKind
  track?: string
}

const features = tableFeatures({
  columnOrderingFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowSortingFeature,
  columnMeta: metaHelper<BookColumnMeta>(),
})

type BookColumn = Column<typeof features, BookWithRelations>
type BookHeader = Header<typeof features, BookWithRelations>
type BookCell = Cell<typeof features, BookWithRelations>

const DATA_FIELDS = (Object.keys(columnWidths) as DisplayField[]).filter(
  (field) => field !== "title",
)

const BOOK_COLUMNS: ColumnDef<typeof features, BookWithRelations>[] = [
  {
    id: "select",
    enableResizing: false,
    meta: { kind: "select", track: "30px" },
  },
  {
    id: "title",
    accessorFn: (row) => row,
    size: 280,
    minSize: MIN_TITLE_WIDTH,
    sortDescFirst: false,
    enableHiding: false,
    meta: { kind: "title", track: "minmax(240px, 30%)" },
  },
  ...DATA_FIELDS.map((field): ColumnDef<typeof features, BookWithRelations> => {
    const def = field === "seriesPosition" ? undefined : getFieldDef(field)
    return {
      id: field,
      accessorFn: (row) => row,
      size: Math.max(MIN_COLUMN_WIDTH, columnWidths[field] + 40),
      enableSorting: !!def?.sortable,
      sortDescFirst: (def?.defaultSort ?? "desc") === "desc",
      meta: { kind: "data" },
      cell: ({ row }) => <ColumnValue book={row.original} field={field} />,
    }
  }),
  {
    id: "spacer",
    enableResizing: false,
    enableHiding: false,
    meta: { kind: "spacer", track: "minmax(0, 1fr)" },
  },
  {
    id: "actions",
    enableResizing: false,
    enableHiding: false,
    meta: { kind: "actions", track: "56px" },
  },
]

const DEFAULT_COLUMN: Partial<ColumnDef<typeof features, BookWithRelations>> = {
  minSize: MIN_COLUMN_WIDTH,
}

const getBookRowId = (book: BookWithRelations) => book.uuid

export function BookTable({
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
  onColumnClick,
  columns,
  showThumbnail = true,
  sortField,
  sortDirection,
  onSortChange,
  ...props
}: BookTableProps) {
  const t = useTranslation("BookList")
  const c = useCommon()
  const tActions = useTranslation("BookActions")
  const tSel = useTranslation("SelectionToolbar")
  const dispatch = useAppDispatch()
  const menu = useBookActionMenu(books, "bulk")

  const showReadaloudBadge = useAppSelector(selectShowReadaloudBadge)
  const showProcessingBadge = useAppSelector(selectShowProcessingBadge)
  const showMissingBadge = useAppSelector(selectShowMissingBadge)

  const emptyMessage = props.emptyMessage ?? t("emptyState")
  const emptySubMessage = props.emptySubMessage ?? t("emptyStateSub")

  const storedOrder = useAppSelector(selectTableColumnOrder)
  const storedWidths = useAppSelector(selectTableColumnWidths)

  const columnOrder = useMemo(
    () => ["select", "title", ...(storedOrder ?? []), ...columns],
    [storedOrder, columns],
  )

  const columnVisibility = useMemo(
    () => ({
      select: !!menu.toggleSelection,
      ...Object.fromEntries(
        DATA_FIELDS.map((field) => [field, columns.includes(field)]),
      ),
    }),
    [menu.toggleSelection, columns],
  )

  const sorting = useMemo<SortingState>(
    () =>
      sortField ? [{ id: sortField, desc: sortDirection === "desc" }] : [],
    [sortField, sortDirection],
  )

  const table = useTable({
    features,
    data: books,
    columns: BOOK_COLUMNS,
    defaultColumn: DEFAULT_COLUMN,
    getRowId: getBookRowId,
    columnResizeMode: "onChange",
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    initialState: { columnSizing: storedWidths },
    state: { columnOrder, columnVisibility, sorting },
    onSortingChange: (updater) => {
      const next = functionalUpdate(updater, sorting)[0]
      if (next) {
        onSortChange?.(next.id as SortField, next.desc ? "desc" : "asc")
      }
    },
  })

  const { columnSizing, columnResizing } = table.state
  const isResizing = columnResizing.isResizingColumn

  useEffect(() => {
    if (isResizing) return
    if (shallowEqual(columnSizing, storedWidths)) return
    dispatch(uiSettingsSlice.actions.setTableColumnWidths(columnSizing))
  }, [isResizing, columnSizing, storedWidths, dispatch])

  const visibleColumns = table.getVisibleLeafColumns()
  const dataColumnIds = visibleColumns
    .filter((column) => column.columnDef.meta?.kind === "data")
    .map((column) => column.id)

  const gridTemplateColumns = visibleColumns
    .map((column) => {
      const track = column.columnDef.meta?.track
      if (track && columnSizing[column.id] === undefined) return track
      const min = column.columnDef.minSize ?? MIN_COLUMN_WIDTH
      return `minmax(${min}px, ${column.getSize()}px)`
    })
    .join(" ")

  const [announcement, setAnnouncement] = useState("")

  const orderBeforeDrag = useRef<string[] | null>(null)
  const handleReorderStart = () => {
    orderBeforeDrag.current = dataColumnIds
  }
  const handleReorderAbort = () => {
    if (orderBeforeDrag.current) {
      dispatch(
        uiSettingsSlice.actions.setTableColumnOrder(orderBeforeDrag.current),
      )
    }
  }

  const moveColumn = (field: string, delta: -1 | 1) => {
    const index = dataColumnIds.indexOf(field)
    const target = index + delta
    if (index < 0 || target < 0 || target >= dataColumnIds.length) return
    const next = [...dataColumnIds]
    next.splice(index, 1)
    next.splice(target, 0, field)
    dispatch(uiSettingsSlice.actions.setTableColumnOrder(next))
    setAnnouncement(
      `${c.plain(`fields.short.${field}` as never)} moved to position ${target + 1} of ${dataColumnIds.length}`,
    )
  }

  const resizeColumnBy = (column: BookColumn, delta: number) => {
    table.setColumnSizing((old) => ({
      ...old,
      [column.id]: Math.max(MIN_COLUMN_WIDTH, column.getSize() + delta),
    }))
  }

  const hideColumn = (field: string) => {
    dispatch(
      uiSettingsSlice.actions.setListDisplayFields(
        columns.filter((f) => f !== field),
      ),
    )
  }

  const tableRef = useRef<HTMLTableElement | null>(null)

  const autofitColumn = (column: BookColumn) => {
    const root = tableRef.current
    if (!root) return
    const probe = document.createElement("div")
    probe.style.position = "fixed"
    probe.style.visibility = "hidden"
    probe.style.width = "max-content"
    root.appendChild(probe)
    let widest = 0
    const measure = (el: Element, className: string) => {
      probe.className = className
      probe.textContent = el.textContent
      widest = Math.max(widest, probe.getBoundingClientRect().width)
    }
    root.querySelectorAll(`[data-col="${column.id}"]`).forEach((el) => {
      measure(el, "text-xs tabular-nums")
    })
    const headerEl = root.querySelector(`[data-col-header="${column.id}"]`)
    if (headerEl) {
      measure(headerEl, "text-xs font-medium tracking-wider uppercase")
    }
    probe.remove()
    if (widest === 0) return
    table.setColumnSizing((old) => ({
      ...old,
      [column.id]: Math.min(
        MAX_AUTOFIT_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, Math.ceil(widest) + 16),
      ),
    }))
  }

  const [headerMenu, setHeaderMenu] = useState<{
    column: BookColumn
    anchor: { getBoundingClientRect: () => DOMRect }
  } | null>(null)

  const openHeaderMenu = (column: BookColumn, e: React.MouseEvent) => {
    e.preventDefault()
    const { clientX, clientY } = e
    setHeaderMenu({
      column,
      anchor: {
        getBoundingClientRect: () => new DOMRect(clientX, clientY, 0, 0),
      },
    })
  }

  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    setScrollElement(findScrollParent(node))
  }, [])

  const rowHeight = showThumbnail ? 52 : 36

  const rows = table.getRowModel().rows

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan: 12,
    useFlushSync: false,
    directDomUpdates: true,
  })

  useEffect(() => {
    rowVirtualizer.measure()
  }, [showThumbnail, rowVirtualizer])

  const virtualRows = rowVirtualizer.getVirtualItems()
  const lastVirtualRowIndex = virtualRows.at(-1)?.index

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

  const allBookUuids = books.map((book) => book.uuid)
  const selectedCount = menu.selection?.selectedBooks.size ?? 0
  const isAllBooksSelected = selectedCount === books.length

  return (
    <>
      <table
        ref={tableRef}
        className="grid w-full caption-bottom text-xs"
        style={
          { "--book-table-cols": gridTemplateColumns } as React.CSSProperties
        }
      >
        <TableHeader className="bg-background sticky top-(--book-filters-height,2.75rem) z-10 -mx-6 grid px-6">
          <Reorder.Group
            as="tr"
            axis="x"
            data-slot="table-row"
            className="border-border grid items-center gap-3 border-b pb-1.5"
            style={{ gridTemplateColumns: "var(--book-table-cols)" }}
            values={dataColumnIds}
            onReorder={(newOrder) => {
              dispatch(uiSettingsSlice.actions.setTableColumnOrder(newOrder))
            }}
          >
            {table.getFlatHeaders().map((header) => {
              switch (header.column.columnDef.meta?.kind) {
                case "select":
                  return (
                    <TableHead
                      key={header.id}
                      className="ml-1 flex shrink-0 items-center justify-center"
                    >
                      <button
                        type="button"
                        aria-label={
                          isAllBooksSelected
                            ? tSel.plain("selectNone")
                            : tSel.plain("selectAll")
                        }
                        className="focus-visible:ring-ring/50 cursor-pointer rounded-full outline-none focus-visible:ring-2"
                        onClick={() =>
                          isAllBooksSelected
                            ? menu.selection?.selectNone()
                            : menu.selection?.selectAll(allBookUuids)
                        }
                      >
                        <SelectionBullet
                          selected={isAllBooksSelected}
                          indeterminate={
                            selectedCount > 0 && !isAllBooksSelected
                          }
                        />
                      </button>
                    </TableHead>
                  )
                case "spacer":
                  return (
                    <TableHead
                      key={header.id}
                      aria-hidden
                      className="h-auto p-0"
                    />
                  )
                case "actions":
                  return (
                    <TableHead key={header.id} className="h-auto p-0">
                      <span className="sr-only">{tSel.plain("actions")}</span>
                    </TableHead>
                  )
                default:
                  return (
                    <BookTableHeader
                      key={header.id}
                      header={header}
                      label={c.plain(
                        `fields.short.${header.column.id}` as never,
                      )}
                      sorted={header.column.getIsSorted()}
                      sortable={header.column.getCanSort()}
                      size={header.column.getSize()}
                      resizing={!!isResizing}
                      position={dataColumnIds.indexOf(header.column.id) + 1}
                      count={dataColumnIds.length}
                      onMove={moveColumn}
                      onResizeBy={resizeColumnBy}
                      onAutofit={autofitColumn}
                      onHeaderContextMenu={openHeaderMenu}
                      onReorderStart={handleReorderStart}
                      onReorderAbort={handleReorderAbort}
                    />
                  )
              }
            })}
          </Reorder.Group>
        </TableHeader>

        {isLoading ? (
          <TableBody className="grid gap-1 py-2">
            {Array.from({ length: 25 }).map((_, i) => (
              <TableRow key={i} className="border-0">
                <TableCell
                  className="bg-muted/40 block h-8 animate-pulse rounded p-0"
                  style={{ height: rowHeight }}
                />
              </TableRow>
            ))}
          </TableBody>
        ) : (
          <TableBody
            ref={containerRef}
            id={BOOK_COLLECTION_ID}
            aria-label="Books"
            className={cn(
              "animate-in fade-in-0 relative grid w-full py-2 transition-opacity duration-300 outline-none",
              showMuted && "opacity-60",
            )}
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null
              const book = row.original

              const isBookSelected =
                menu.selection?.isSelected(book.uuid) ?? false

              return (
                <BookRow
                  key={book.uuid}
                  book={book}
                  isBookSelected={isBookSelected}
                  selectedBookUuid={selectedBookUuid}
                  rowHeight={rowHeight}
                  start={virtualRow.start}
                  toggleSelection={menu.toggleSelection}
                  handleSelectRange={menu.handleSelectRange}
                  onBookClick={onBookClick}
                  index={virtualRow.index}
                  isSelecting={menu.isSelecting}
                  showThumbnail={showThumbnail}
                  showReadaloudBadge={showReadaloudBadge}
                  showProcessingBadge={showProcessingBadge}
                  showMissingBadge={showMissingBadge}
                  cells={row.getVisibleCells()}
                  onColumnClick={onColumnClick}
                  handle={menu.handle}
                  handleOpenMenu={menu.handleOpenMenu}
                />
              )
            })}
          </TableBody>
        )}
      </table>

      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>

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

      <FilterableMenu
        open={headerMenu !== null}
        onOpenChange={(open) => {
          if (!open) setHeaderMenu(null)
        }}
      >
        {headerMenu && (
          <FilterableMenuContent
            searchable={false}
            anchor={headerMenu.anchor}
            align="start"
            className="z-100 w-48"
          >
            <FilterableMenuItem
              icon={<icon.ArrowAutofitWidth className="size-4" />}
              onSelect={() => {
                autofitColumn(headerMenu.column)
              }}
            >
              {t("columnMenu.autofit")}
            </FilterableMenuItem>
            <FilterableMenuItem
              icon={<icon.ArrowBack className="size-4" />}
              onSelect={() => {
                headerMenu.column.resetSize()
              }}
            >
              {t("columnMenu.resetWidth")}
            </FilterableMenuItem>
            <FilterableMenuSeparator />
            <FilterableMenuItem
              icon={<icon.ArrowLeft className="size-4" />}
              disabled={dataColumnIds.indexOf(headerMenu.column.id) <= 0}
              onSelect={() => {
                moveColumn(headerMenu.column.id, -1)
              }}
            >
              {t("columnMenu.moveLeft")}
            </FilterableMenuItem>
            <FilterableMenuItem
              icon={<icon.ArrowRight className="size-4" />}
              disabled={
                dataColumnIds.indexOf(headerMenu.column.id) >=
                dataColumnIds.length - 1
              }
              onSelect={() => {
                moveColumn(headerMenu.column.id, 1)
              }}
            >
              {t("columnMenu.moveRight")}
            </FilterableMenuItem>
            <FilterableMenuSeparator />
            <FilterableMenuItem
              icon={<icon.EyeOff className="size-4" />}
              onSelect={() => {
                hideColumn(headerMenu.column.id)
              }}
            >
              {t("columnMenu.hide")}
            </FilterableMenuItem>
          </FilterableMenuContent>
        )}
      </FilterableMenu>

      {menu.menuDialogs}
    </>
  )
}

function BookTableHeader({
  header,
  label,
  sorted,
  sortable,
  size,
  resizing,
  position,
  count,
  onMove,
  onResizeBy,
  onAutofit,
  onHeaderContextMenu,
  onReorderStart,
  onReorderAbort,
}: {
  header: BookHeader
  label: string
  sorted: false | SortDirection
  sortable: boolean
  size: number
  resizing: boolean
  position: number
  count: number
  onMove: (field: string, delta: -1 | 1) => void
  onResizeBy: (column: BookColumn, delta: number) => void
  onAutofit: (column: BookColumn) => void
  onHeaderContextMenu: (column: BookColumn, e: React.MouseEvent) => void
  onReorderStart: () => void
  onReorderAbort: () => void
}) {
  const dragControls = useDragControls()

  const [dragActive, setDragActive] = useState(false)
  useEffect(() => {
    if (!dragActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      dragControls.stop()
      onReorderAbort()
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
    }
  }, [dragActive, dragControls, onReorderAbort])

  const column = header.column
  const field = column.id as DisplayField
  const isData = column.columnDef.meta?.kind === "data"

  const boxRef = useRef<HTMLSpanElement | null>(null)
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const [labelFits, setLabelFits] = useState(true)

  useLayoutEffect(() => {
    const box = boxRef.current
    const labelEl = labelRef.current
    if (!box || !labelEl) return
    const check = () => {
      const reserved =
        HEADER_ICON_SIZE +
        HEADER_LABEL_GAP +
        (sorted ? HEADER_ICON_SIZE + HEADER_CHEVRON_GAP : 0)
      setLabelFits(labelEl.scrollWidth <= box.clientWidth - reserved)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(box)
    return () => {
      observer.disconnect()
    }
  }, [sorted, label])

  const labelContent = (
    <span
      ref={boxRef}
      className={cn(
        "flex min-w-0 grow items-center overflow-hidden",
        isData ? "justify-end" : "justify-start",
      )}
    >
      <icon.FieldIcon field={field} className="size-3 shrink-0" />
      <span
        ref={labelRef}
        data-col-header={field}
        className={cn(
          "shrink-0 overflow-hidden whitespace-nowrap",
          labelFits ? "ml-1" : "invisible w-0",
        )}
      >
        {label}
      </span>
      {sorted &&
        (sorted === "asc" ? (
          <icon.ArrowUp className="ml-0.5 size-3 shrink-0" />
        ) : (
          <icon.ArrowDown className="ml-0.5 size-3 shrink-0" />
        ))}
    </span>
  )

  const resizeHandle = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={Math.round(size)}
      aria-valuemin={column.columnDef.minSize ?? MIN_COLUMN_WIDTH}
      tabIndex={0}
      onPointerDown={header.getResizeHandler()}
      onDoubleClick={() => {
        if (isData) onAutofit(column)
        else column.resetSize()
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
        e.preventDefault()
        e.stopPropagation()
        const step = e.shiftKey
          ? KEYBOARD_RESIZE_STEP * 4
          : KEYBOARD_RESIZE_STEP
        onResizeBy(column, e.key === "ArrowRight" ? step : -step)
      }}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        dragControls.cancel()
      }}
      className={cn(
        "absolute top-0 -right-2.5 z-10 h-full w-3 cursor-col-resize outline-none",
        "after:bg-border hover:after:bg-primary focus-visible:after:bg-primary after:absolute after:top-0 after:left-1/2 after:h-full after:w-px",
        column.getIsResizing() && "after:bg-primary after:opacity-100",
      )}
    />
  )

  const sortButton = sortable ? (
    <button
      type="button"
      title={label}
      className={cn(
        "text-muted-foreground hover:text-foreground flex min-w-0 grow cursor-pointer items-center text-[11px] font-medium tracking-wider uppercase",
        isData ? "justify-end" : "justify-start",
        sorted && "text-foreground",
      )}
      aria-label={`Sort by ${label}`}
      onClick={header.column.getToggleSortingHandler()}
    >
      {labelContent}
    </button>
  ) : (
    <span
      title={label}
      className="text-muted-foreground flex min-w-0 grow items-center justify-end text-xs font-medium tracking-wider uppercase"
    >
      {labelContent}
    </span>
  )

  const ariaSort = sorted
    ? sorted === "asc"
      ? "ascending"
      : "descending"
    : undefined

  if (!isData) {
    return (
      <TableHead
        aria-sort={ariaSort}
        className="text-muted-foreground relative flex h-auto items-center p-0 text-xs font-medium tracking-wider uppercase"
      >
        {sortButton}
        {resizeHandle}
      </TableHead>
    )
  }

  return (
    <Reorder.Item
      as="th"
      value={field}
      dragListener={false}
      dragControls={dragControls}
      layout="position"
      transition={resizing ? { layout: { duration: 0 } } : undefined}
      onDragStart={() => {
        setDragActive(true)
        onReorderStart()
      }}
      onDragEnd={() => {
        setDragActive(false)
      }}
      aria-sort={ariaSort}
      className="group relative flex w-full min-w-0 items-center justify-end gap-0.5 pr-2"
    >
      <button
        type="button"
        onPointerDown={(e) => {
          dragControls.start(e)
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
          e.preventDefault()
          e.stopPropagation()
          onMove(field, e.key === "ArrowLeft" ? -1 : 1)
        }}
        className="group-hover:text-foreground focus-visible:ring-ring/50 rounded-xs opacity-0 transition-opacity outline-none group-focus-within:opacity-100 group-hover:cursor-grab group-hover:opacity-100 focus-visible:ring-2 active:cursor-grabbing"
        aria-label={`Reorder ${label} column, ${position} of ${count}. Use arrow keys to move`}
      >
        <icon.GripVertical className="size-3 shrink-0" />
      </button>
      {sortButton}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground h-full w-3 opacity-100 transition-opacity outline-none group-hover:opacity-100 md:opacity-0"
        aria-label={`Resize ${label} column`}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onHeaderContextMenu(column, e)
        }}
      >
        <icon.DotsVertical className="size-3 shrink-0" />
      </button>

      {resizeHandle}
    </Reorder.Item>
  )
}

function BookRow({
  book,
  isBookSelected,
  selectedBookUuid,
  rowHeight,
  start,
  toggleSelection,
  handleSelectRange,
  onBookClick,
  index,
  isSelecting,
  showThumbnail,
  showReadaloudBadge,
  showProcessingBadge,
  showMissingBadge,
  cells,
  onColumnClick,
  handle,
  handleOpenMenu,
}: {
  book: BookWithRelations
  isBookSelected: boolean
  selectedBookUuid?: string | null
  rowHeight: number
  start: number
  toggleSelection?: (uuid: UUID) => void
  handleSelectRange?: (uuid: UUID) => void
  onBookClick?: (
    book: BookWithRelations,
    isSelecting: boolean,
    isBookSelected: boolean,
  ) => void
  index: number
  isSelecting: boolean
  showThumbnail: boolean
  showReadaloudBadge: boolean
  showProcessingBadge: boolean
  showMissingBadge: boolean
  cells: BookCell[]
  onColumnClick?: (book: BookWithRelations, field: DisplayField) => void
  handle: Popover.Handle<unknown>
  handleOpenMenu: (book: BookWithRelations) => void
}) {
  const scope = useCoverScope(book)

  return (
    <TableRow
      key={book.uuid}
      data-index={index}
      data-book-uuid={book.uuid}
      {...scope}
      className={cn(
        "group hover:bg-tint absolute top-0 left-0 grid w-full cursor-pointer items-center gap-3 rounded-md transition-colors",
        isBookSelected && "bg-tint/50 ring-cover-header ring-1 ring-inset",
        book.uuid === selectedBookUuid &&
          "bg-tint/70 ring-cover-header ring-1 ring-inset",
      )}
      style={{
        gridTemplateColumns: "var(--book-table-cols)",
        height: rowHeight,
        transform: `translateY(${start}px)`,
        ...scope.style,
      }}
      onClick={() => {
        onBookClick?.(book, isSelecting, isBookSelected)
      }}
    >
      {cells.map((cell) => {
        switch (cell.column.columnDef.meta?.kind) {
          case "select":
            return (
              <TableCell key={cell.id}>
                {toggleSelection && (
                  <SelectionCheckbox
                    uuid={book.uuid}
                    checked={isBookSelected}
                    isSelecting={isSelecting}
                    onToggle={toggleSelection}
                    onSelectRange={handleSelectRange}
                    className="shrink-0"
                  />
                )}
              </TableCell>
            )

          case "title":
            return (
              <TableCell
                key={cell.id}
                className="line-clamp-2 flex h-full items-center gap-2 pl-1 hyphens-auto whitespace-normal"
              >
                {showThumbnail ? (
                  <div
                    className="relative flex h-11 w-8 shrink-0 items-center justify-center"
                    style={
                      {
                        "--radius-cover": "2px",
                      } as React.CSSProperties
                    }
                  >
                    <Cover book={book} width={32} interactive={false} />

                    {showReadaloudBadge &&
                      book.readaloud?.status === "ALIGNED" && (
                        <div className="bg-primary absolute -top-0.5 -right-0.5 z-30 flex size-3 shrink-0 items-center justify-center rounded-full">
                          <IconReadaloud className="size-2.5 text-white" />
                        </div>
                      )}

                    {showProcessingBadge &&
                      (book.readaloud?.status === "PROCESSING" ||
                        book.readaloud?.status === "QUEUED") && (
                        <ProcessingIndicator
                          book={book}
                          size={14}
                          className="absolute -right-0.5 -bottom-0.5 z-30"
                        />
                      )}

                    {showMissingBadge && hasMissingMedia(book) && (
                      <MissingBadge
                        book={book}
                        className="absolute -right-0.5 -bottom-0.5 z-30 size-3"
                      />
                    )}
                  </div>
                ) : showReadaloudBadge ? (
                  <IconReadaloud className="text-cover-accent size-3 shrink-0" />
                ) : showProcessingBadge ? (
                  <ProcessingIndicator
                    book={book}
                    size={14}
                    className="shrink-0"
                  />
                ) : null}

                <V3Link
                  href={`/books/${book.uuid}`}
                  prefetch={false}
                  className={cn(
                    showThumbnail ? "line-clamp-2" : "line-clamp-1",
                  )}
                  onClick={(e) => {
                    if (onBookClick) e.preventDefault()
                  }}
                >
                  <span
                    className={cn(
                      "group-hover:text-tinted-strong text-sm",
                      book.uuid === selectedBookUuid && "text-tinted-strong",
                    )}
                  >
                    {book.title}
                  </span>
                </V3Link>

                {!showThumbnail &&
                  showMissingBadge &&
                  hasMissingMedia(book) && <MissingBadge book={book} inline />}
              </TableCell>
            )

          case "spacer":
            return <TableCell key={cell.id} aria-hidden className="p-0" />

          case "actions":
            return (
              <TableCell
                key={cell.id}
                className="flex items-center justify-end pr-2"
              >
                <Popover.Trigger
                  handle={handle}
                  aria-label="Open menu"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenMenu(book)
                  }}
                  className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  <icon.DotsVertical className="size-3.5" />
                </Popover.Trigger>
              </TableCell>
            )

          default: {
            const field = cell.column.id as DisplayField
            const isClickable =
              !!onColumnClick &&
              (field === "alignmentGrade" || field === "alignmentConfidence") &&
              book.alignmentSummary?.grade != null

            return (
              <TableCell
                key={cell.id}
                data-col={field}
                className={cn(
                  "text-muted-foreground group-hover:text-tinted h-full min-w-0 truncate text-right text-xs hyphens-auto whitespace-normal tabular-nums",
                  isClickable && "hover:text-foreground cursor-pointer",
                )}
                onClick={
                  isClickable
                    ? (e) => {
                        e.stopPropagation()
                        onColumnClick(book, field)
                      }
                    : undefined
                }
              >
                <div className="flex h-full items-center justify-end">
                  <span
                    className={cn(
                      showThumbnail ? "line-clamp-2" : "line-clamp-1",
                    )}
                  >
                    <FlexRender cell={cell} />
                  </span>
                </div>
              </TableCell>
            )
          }
        }
      })}
    </TableRow>
  )
}
