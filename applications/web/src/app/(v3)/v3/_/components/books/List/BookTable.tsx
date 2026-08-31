"use client"

import { Popover } from "@base-ui/react/popover"
import {
  type Cell,
  type ColumnDef,
  type ColumnSizingState,
  type Header,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Reorder, useDragControls } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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
const DEFAULT_TITLE_TRACK = "minmax(240px, 30%)"

function defaultColumnWidth(field: DisplayField): number {
  return Math.max(MIN_COLUMN_WIDTH, columnWidths[field] + 40)
}

function orderColumns(
  fields: DisplayField[],
  storedOrder: string[] | null,
): DisplayField[] {
  const dataFields: DisplayField[] = fields.filter((f) => f !== "title")
  if (!storedOrder) return dataFields
  const ordered = storedOrder.filter((id) =>
    dataFields.includes(id as DisplayField),
  ) as DisplayField[]
  const rest = dataFields.filter((f) => !ordered.includes(f))
  return [...ordered, ...rest]
}

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

  const dataColumns = useMemo(
    () => orderColumns(columns, storedOrder),
    [columns, storedOrder],
  )

  const columnDefs = useMemo<ColumnDef<BookWithRelations>[]>(
    () =>
      dataColumns.map((field) => ({
        id: field,
        accessorFn: (row) => row,
        size: storedWidths[field] ?? defaultColumnWidth(field),
        minSize: MIN_COLUMN_WIDTH,
        header: c.plain(`fields.short.${field}` as never),
        cell: ({ row }) => <ColumnValue book={row.original} field={field} />,
      })),
    [dataColumns, storedWidths, c],
  )

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})

  const table = useReactTable({
    data: books,
    columns: columnDefs,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.uuid,
  })

  const isResizing = table.getState().columnSizingInfo.isResizingColumn
  const wasResizing = useRef<string | false>(false)
  useEffect(() => {
    if (wasResizing.current && !isResizing) {
      dispatch(uiSettingsSlice.actions.setTableColumnWidths(columnSizing))
    }
    wasResizing.current = isResizing
  }, [isResizing, columnSizing, dispatch])

  const [announcement, setAnnouncement] = useState("")

  const orderBeforeDrag = useRef<DisplayField[] | null>(null)
  const handleReorderStart = () => {
    orderBeforeDrag.current = dataColumns
  }
  const handleReorderAbort = () => {
    if (orderBeforeDrag.current) {
      dispatch(
        uiSettingsSlice.actions.setTableColumnOrder(orderBeforeDrag.current),
      )
    }
  }

  const moveColumn = (field: DisplayField, delta: -1 | 1) => {
    const index = dataColumns.indexOf(field)
    const target = index + delta
    if (index < 0 || target < 0 || target >= dataColumns.length) return
    const next = [...dataColumns]
    next.splice(index, 1)
    next.splice(target, 0, field)
    dispatch(uiSettingsSlice.actions.setTableColumnOrder(next))
    setAnnouncement(
      `${c.plain(`fields.short.${field}` as never)} moved to position ${target + 1} of ${dataColumns.length}`,
    )
  }

  const resizeColumnBy = (field: DisplayField, delta: number) => {
    const column = table.getColumn(field)
    if (!column) return
    const next = {
      ...columnSizing,
      [field]: Math.max(MIN_COLUMN_WIDTH, column.getSize() + delta),
    }
    setColumnSizing(next)
    dispatch(uiSettingsSlice.actions.setTableColumnWidths(next))
  }

  const resetColumnWidth = (field: DisplayField) => {
    setColumnSizing(
      Object.fromEntries(
        Object.entries(columnSizing).filter(([key]) => key !== field),
      ),
    )
    dispatch(uiSettingsSlice.actions.resetTableColumnWidth(field))
  }

  const hideColumn = (field: DisplayField) => {
    dispatch(
      uiSettingsSlice.actions.setListDisplayFields(
        columns.filter((f) => f !== field),
      ),
    )
  }

  const tableRef = useRef<HTMLTableElement | null>(null)

  const autofitColumn = (field: DisplayField) => {
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
    root.querySelectorAll(`[data-col="${field}"]`).forEach((el) => {
      measure(el, "text-xs tabular-nums")
    })
    const headerEl = root.querySelector(`[data-col-header="${field}"]`)
    if (headerEl) {
      measure(headerEl, "text-xs font-medium tracking-wider uppercase")
    }
    probe.remove()
    if (widest === 0) return
    const next = {
      ...columnSizing,
      [field]: Math.min(
        MAX_AUTOFIT_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, Math.ceil(widest) + 16),
      ),
    }
    setColumnSizing(next)
    dispatch(uiSettingsSlice.actions.setTableColumnWidths(next))
  }

  const [liveTitleWidth, setLiveTitleWidth] = useState<number | null>(null)
  const [titleResizing, setTitleResizing] = useState(false)
  const titleHeadRef = useRef<HTMLTableCellElement | null>(null)
  const storedTitleWidth = storedWidths["title"]
  const titleWidth = liveTitleWidth ?? storedTitleWidth

  const startTitleResize = (e: React.PointerEvent) => {
    const el = titleHeadRef.current
    if (!el) return
    e.preventDefault()
    const startX = e.clientX
    const startWidth = el.getBoundingClientRect().width
    const widthAt = (ev: PointerEvent) =>
      Math.max(MIN_TITLE_WIDTH, Math.round(startWidth + (ev.clientX - startX)))
    setTitleResizing(true)
    let moved = false
    const onMove = (ev: PointerEvent) => {
      moved = true
      setLiveTitleWidth(widthAt(ev))
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setTitleResizing(false)
      setLiveTitleWidth(null)
      if (moved) {
        dispatch(
          uiSettingsSlice.actions.setTableColumnWidths({ title: widthAt(ev) }),
        )
      }
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const resizeTitleBy = (delta: number) => {
    const current =
      storedTitleWidth ?? titleHeadRef.current?.getBoundingClientRect().width
    if (current === undefined) return
    dispatch(
      uiSettingsSlice.actions.setTableColumnWidths({
        title: Math.max(MIN_TITLE_WIDTH, Math.round(current + delta)),
      }),
    )
  }

  const [headerMenu, setHeaderMenu] = useState<{
    field: DisplayField
    anchor: { getBoundingClientRect: () => DOMRect }
  } | null>(null)

  const openHeaderMenu = (field: DisplayField, e: React.MouseEvent) => {
    e.preventDefault()
    const { clientX, clientY } = e
    setHeaderMenu({
      field,
      anchor: {
        getBoundingClientRect: () => new DOMRect(clientX, clientY, 0, 0),
      },
    })
  }

  const gridTemplateColumns = [
    // selection checkbox column
    ...(menu.toggleSelection ? ["30px"] : []),
    titleWidth !== undefined ? `${titleWidth}px` : DEFAULT_TITLE_TRACK,
    ...table.getVisibleLeafColumns().map((col) => `${col.getSize()}px`),
    "minmax(0, 1fr)",
    "56px",
  ].join(" ")

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
    table.setState((state) => ({ ...state }))
  }, [showThumbnail])

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
        <TableHeader className="bg-background sticky top-11 z-10 -mx-6 grid px-6">
          <Reorder.Group
            as="tr"
            axis="x"
            data-slot="table-row"
            className="border-border grid items-center gap-3 border-b pb-1.5"
            style={{ gridTemplateColumns: "var(--book-table-cols)" }}
            values={table
              .getFlatHeaders()
              .map((header) => header.column.id as DisplayField)}
            onReorder={(newOrder) => {
              dispatch(uiSettingsSlice.actions.setTableColumnOrder(newOrder))
            }}
          >
            {menu.toggleSelection && (
              <TableHead className="ml-1 flex shrink-0 items-center justify-center">
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
                    indeterminate={selectedCount > 0 && !isAllBooksSelected}
                  />
                </button>
              </TableHead>
            )}
            <TableHead
              ref={titleHeadRef}
              aria-sort={
                sortField === "title"
                  ? sortDirection === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
              className="text-muted-foreground relative flex h-auto items-center p-0 text-xs font-medium tracking-wider uppercase"
            >
              <button
                type="button"
                className={cn(
                  "text-muted-foreground flex min-w-0 cursor-pointer items-center gap-0.5 truncate text-[11px] font-medium tracking-wider uppercase",
                  sortField === "title" && "text-foreground",
                  sortField !== "title" && "hover:text-foreground",
                )}
                onClick={() => {
                  if (sortField === "title") {
                    onSortChange?.(
                      "title",
                      sortDirection === "asc" ? "desc" : "asc",
                    )
                  } else {
                    onSortChange?.("title", "desc")
                  }
                }}
              >
                {c.plain("fields.short.title" as never)}

                {sortField === "title" &&
                  (sortDirection === "asc" ? (
                    <icon.ChevronUp className="size-3 shrink-0" />
                  ) : (
                    <icon.ChevronDown className="size-3 shrink-0" />
                  ))}
              </button>

              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${c.plain("fields.short.title" as never)} column`}
                aria-valuenow={
                  titleWidth !== undefined ? Math.round(titleWidth) : undefined
                }
                aria-valuemin={MIN_TITLE_WIDTH}
                tabIndex={0}
                onPointerDown={startTitleResize}
                onDoubleClick={() => {
                  dispatch(
                    uiSettingsSlice.actions.resetTableColumnWidth("title"),
                  )
                }}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
                  e.preventDefault()
                  e.stopPropagation()
                  const step = e.shiftKey
                    ? KEYBOARD_RESIZE_STEP * 4
                    : KEYBOARD_RESIZE_STEP
                  resizeTitleBy(e.key === "ArrowRight" ? step : -step)
                }}
                className={cn(
                  "absolute top-0 -right-2.5 z-10 h-full w-3 cursor-col-resize outline-none",
                  "after:bg-border hover:after:bg-primary focus-visible:after:bg-primary after:absolute after:top-0 after:left-1/2 after:h-full after:w-px",
                  titleResizing && "after:bg-primary",
                )}
              />
            </TableHead>

            {table.getFlatHeaders().map((header, index) => {
              return (
                <BookTableHeader
                  key={header.id}
                  header={header}
                  onSortChange={onSortChange}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  resizing={!!isResizing || titleResizing}
                  position={index + 1}
                  count={dataColumns.length}
                  onMove={moveColumn}
                  onResizeBy={resizeColumnBy}
                  onAutofit={autofitColumn}
                  onHeaderContextMenu={openHeaderMenu}
                  onReorderStart={handleReorderStart}
                  onReorderAbort={handleReorderAbort}
                />
              )
            })}
            <TableHead aria-hidden className="h-auto p-0" />
            <TableHead className="h-auto p-0">
              <span className="sr-only">{tSel.plain("actions")}</span>
            </TableHead>
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
                autofitColumn(headerMenu.field)
              }}
            >
              {t("columnMenu.autofit")}
            </FilterableMenuItem>
            <FilterableMenuItem
              icon={<icon.ArrowBack className="size-4" />}
              onSelect={() => {
                resetColumnWidth(headerMenu.field)
              }}
            >
              {t("columnMenu.resetWidth")}
            </FilterableMenuItem>
            <FilterableMenuSeparator />
            <FilterableMenuItem
              icon={<icon.ArrowLeft className="size-4" />}
              disabled={dataColumns.indexOf(headerMenu.field) <= 0}
              onSelect={() => {
                moveColumn(headerMenu.field, -1)
              }}
            >
              {t("columnMenu.moveLeft")}
            </FilterableMenuItem>
            <FilterableMenuItem
              icon={<icon.ArrowRight className="size-4" />}
              disabled={
                dataColumns.indexOf(headerMenu.field) >= dataColumns.length - 1
              }
              onSelect={() => {
                moveColumn(headerMenu.field, 1)
              }}
            >
              {t("columnMenu.moveRight")}
            </FilterableMenuItem>
            <FilterableMenuSeparator />
            <FilterableMenuItem
              icon={<icon.EyeOff className="size-4" />}
              onSelect={() => {
                hideColumn(headerMenu.field)
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

const KEYBOARD_RESIZE_STEP = 8

function BookTableHeader({
  header,
  onSortChange,
  sortField,
  sortDirection,
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
  header: Header<BookWithRelations, unknown>
  onSortChange?: (field: SortField, direction: SortDirection) => void
  sortField?: SortField
  sortDirection?: SortDirection
  resizing: boolean
  position: number
  count: number
  onMove: (field: DisplayField, delta: -1 | 1) => void
  onResizeBy: (field: DisplayField, delta: number) => void
  onAutofit: (field: DisplayField) => void
  onHeaderContextMenu: (field: DisplayField, e: React.MouseEvent) => void
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

  const field = header.column.id as DisplayField
  const def = field === "seriesPosition" ? undefined : getFieldDef(field)
  const sortable = !!onSortChange && !!def?.sortable
  const isActive = sortField === field
  const label = header.column.columnDef.header as string

  const labelContent = (
    <>
      <span className="truncate" data-col-header={field}>
        {flexRender(header.column.columnDef.header, header.getContext())}
      </span>
      {isActive &&
        (sortDirection === "asc" ? (
          <icon.ChevronUp className="size-3 shrink-0" />
        ) : (
          <icon.ChevronDown className="size-3 shrink-0" />
        ))}
    </>
  )

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
      aria-sort={
        isActive
          ? sortDirection === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
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
      {sortable ? (
        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:text-foreground flex min-w-0 grow cursor-pointer items-center justify-end gap-0.5 truncate text-[11px] font-medium tracking-wider uppercase",
            isActive && "text-foreground",
          )}
          aria-label={`Sort by ${label}`}
          onClick={() => {
            const asSort = field as SortField
            if (isActive) {
              onSortChange(asSort, sortDirection === "asc" ? "desc" : "asc")
            } else {
              onSortChange(asSort, def.defaultSort ?? "desc")
            }
          }}
        >
          {labelContent}
        </button>
      ) : (
        <span className="text-muted-foreground flex min-w-0 grow items-center justify-end gap-0.5 truncate text-xs font-medium tracking-wider uppercase">
          {labelContent}
        </span>
      )}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground h-full w-3 opacity-100 transition-opacity outline-none group-hover:opacity-100 md:opacity-0"
        aria-label={`Resize ${label} column`}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onHeaderContextMenu(field, e)
        }}
      >
        <icon.DotsVertical className="size-3 shrink-0" />
      </button>

      {/* resize handle on the column's right edge: dragging right widens and
          the edge follows the pointer (slack lives in the spacer track).
          keyboard mirrors that; double click fits the column to its content */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        aria-valuenow={Math.round(header.column.getSize())}
        aria-valuemin={MIN_COLUMN_WIDTH}
        tabIndex={0}
        onPointerDown={header.getResizeHandler()}
        onDoubleClick={() => {
          onAutofit(field)
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
          e.preventDefault()
          e.stopPropagation()
          const step = e.shiftKey
            ? KEYBOARD_RESIZE_STEP * 4
            : KEYBOARD_RESIZE_STEP
          onResizeBy(field, e.key === "ArrowRight" ? step : -step)
        }}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          dragControls.cancel()
        }}
        className={cn(
          "absolute top-0 -right-2.5 z-10 h-full w-3 cursor-col-resize outline-none",
          "after:bg-border hover:after:bg-primary focus-visible:after:bg-primary after:absolute after:top-0 after:left-1/2 after:h-full after:w-px",
          header.column.getIsResizing() && "after:bg-primary after:opacity-100",
        )}
      />
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
  cells: Cell<BookWithRelations, unknown>[]
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
      {toggleSelection && (
        <TableCell>
          <SelectionCheckbox
            uuid={book.uuid}
            checked={isBookSelected}
            isSelecting={isSelecting}
            onToggle={toggleSelection}
            onSelectRange={handleSelectRange}
            className="shrink-0"
          />
        </TableCell>
      )}
      {/* title cell */}
      <TableCell className="line-clamp-2 flex h-full items-center gap-2 pl-1 hyphens-auto whitespace-normal">
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

            {showReadaloudBadge && book.readaloud?.status === "ALIGNED" && (
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
          <ProcessingIndicator book={book} size={14} className="shrink-0" />
        ) : null}

        <V3Link
          href={`/books/${book.uuid}`}
          prefetch={false}
          className={cn(showThumbnail ? "line-clamp-2" : "line-clamp-1")}
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

        {!showThumbnail && showMissingBadge && hasMissingMedia(book) && (
          <MissingBadge book={book} inline />
        )}
      </TableCell>

      {/* data cells */}
      {cells.map((cell) => {
        const field = cell.column.id as DisplayField
        const isClickable =
          !!onColumnClick &&
          (field === "alignmentGrade" || field === "alignmentScore") &&
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
                className={cn(showThumbnail ? "line-clamp-2" : "line-clamp-1")}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </span>
            </div>
          </TableCell>
        )
      })}

      {/* slack track */}
      <TableCell aria-hidden className="p-0" />

      {/* actions */}
      <TableCell className="flex items-center justify-end pr-2">
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
    </TableRow>
  )
}
