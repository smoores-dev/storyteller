"use client"

import { useHotkey } from "@tanstack/react-hotkeys"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Drawer } from "vaul-base"

import { BookFilters } from "@v3/_/components/books"
import { BooksView } from "@v3/_/components/books/BooksView"
import { useClaimBookPanel } from "@v3/_/components/books/FloatingBookPanel"
import { SelectionToolbar } from "@v3/_/components/books/SelectionToolbar"
import {
  BOOK_COLLECTION_ID,
  BOOK_DETAIL_PANEL_ID,
} from "@v3/_/components/books/keyboard-nav"
import { CollapsibleText } from "@v3/_/components/ui/collapsible-text"
import {
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  PageContent,
  PageHeader,
  PageLayout,
  PageMain,
  PagePanel,
  PageSidebar,
} from "@v3/_/components/ui/page-layout"
import {
  type BookFiltersController,
  useBookFilters,
} from "@v3/_/hooks/use-book-filters"
import {
  BookSelectionProvider,
  useBookSelection,
} from "@v3/_/hooks/use-book-selection"
import {
  ESCAPE_PRIORITY,
  useEscapeHandler,
} from "@v3/_/hooks/use-escape-cascade"
import { useBookInSidePanel } from "@v3/_/hooks/use-open-book"
import { useReportPanel } from "@v3/_/hooks/use-report-panel"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { SiteHeader } from "@/app/(v3)/v3/_/components/site-header"
import { useSidebar } from "@/app/(v3)/v3/_/components/ui/sidebar"
import { useUserPreferences } from "@/app/(v3)/v3/_/components/user-preferences-provider"
import { useLayoutAnimations } from "@/app/(v3)/v3/_/hooks/use-layout-animations"
import { useIsMobile } from "@/app/(v3)/v3/_/hooks/use-mobile"
import { usePanelWidthDriver } from "@/app/(v3)/v3/_/hooks/use-panel-width-driver"
import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import { type ShelfFilterNode, type ShelfOrderBy } from "@/shelves"
import {
  type BookSort,
  type DisplayField,
  GENERAL_SORT_FIELDS,
  type SortContext,
  type SortDirection,
  type SortField,
  deriveDisplayFields,
} from "@/sort"
import {
  type ListBooksQueryArg,
  type ListShelfBooksQueryArg,
  useGetBooksCountQuery,
  useListInfiniteBooksInfiniteQuery,
  useListInfiniteShelfBooksInfiniteQuery,
} from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  type BookLayout,
  selectAlwaysLoadAllBooks,
  selectGridDisplayFields,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"
import { type UUID } from "@/uuid"

import { BookCountIndicator } from "./BookCountIndicator"
import { DynamicBookDetailsContent } from "./BookDetails/DynamicBookDetailsContent"
import { useCoverScope } from "./CoverScope"
import { GRID_CARD_WIDTHS, GRID_SPACING_PX } from "./Grid/BookGrid"
import { PanelResizeProvider } from "./panel-resize-context"

export type BookListSource =
  | {
      kind: "books"
      seed?: ShelfFilterNode | null
      seriesContext?: UUID
      collectionContext?: UUID
      limit?: number
    }
  | {
      kind: "shelf"
      shelfUuid: UUID
      orderBy?: ShelfOrderBy | null
      orderDirection?: "asc" | "desc" | null
    }

export type BookListBreadcrumbs = (
  | { label: string; url?: string }
  | { render: ReactNode }
)[]

type BookListPageProps = {
  source: BookListSource
  skip?: boolean

  seedLabel?: string | undefined
  defaultSort?: BookSort[number] | undefined
  extraSortFields?: SortField[]

  breadcrumbs: BookListBreadcrumbs
  headerActions?: ReactNode
  banner?: ReactNode
  sidebar?: ReactNode
  description?: string | null | undefined
  filtersClassName?: string
  contentClassName?: string
  listDisplayFields?: DisplayField[]

  bookClickMode?: "panel" | "report"
  enableBookStepping?: boolean

  emptyMessage?: string
  emptySubMessage?: string
  emptyFilteredSubMessage?: string
  forceDisplayMode?: ForceDisplayMode
}

export type ForceDisplayMode = {
  layout: BookLayout
  displayFields: DisplayField[]
  sortMode: SortField
  sortDirection: SortDirection
}

type BookListPageState = {
  controller: BookFiltersController
  books: BookWithRelations[]
  isLoading: boolean
  selectedBookUuid: string | null
  displayFields: DisplayField[]
  displayContext: SortContext
}

const BookListPageContext = createContext<BookListPageState | null>(null)

export function useBookListPageState(): BookListPageState {
  const state = useContext(BookListPageContext)
  if (!state) {
    throw new Error("useBookListPageState must be used inside <BookListPage>")
  }
  return state
}

export function useOptionalBookListPageState(): BookListPageState | null {
  return useContext(BookListPageContext)
}

const NEXT_PREFETCH_MARGIN = 3

const DESCRIPTION_LINE_HEIGHT = 20

function BookListPageInner({
  source,
  skip = false,
  seedLabel,
  defaultSort,
  extraSortFields,
  breadcrumbs,
  headerActions,
  banner,
  sidebar,
  description,
  filtersClassName,
  contentClassName,
  listDisplayFields,
  bookClickMode = "panel",
  enableBookStepping = false,
  emptyMessage,
  emptySubMessage,
  emptyFilteredSubMessage,
  forceDisplayMode,
}: BookListPageProps) {
  const dispatch = useAppDispatch()

  useClaimBookPanel()

  const gridDisplayFields = useAppSelector(selectGridDisplayFields)

  const handleDisplayFieldsChange = useCallback(
    (fields: DisplayField[] | null) => {
      dispatch(uiSettingsSlice.actions.setGridDisplayFields(fields))
    },
    [dispatch],
  )

  const sidebarWidth = useAppSelector(
    (state) => state.uiSettings.librarySidebarWidth,
  )
  const handleSidebarWidthChange = useCallback(
    (width: number) => {
      dispatch(uiSettingsSlice.actions.setLibrarySidebarWidth(width))
    },
    [dispatch],
  )

  const isBooksSource = source.kind === "books"

  const controller = useBookFilters({
    seed: (isBooksSource ? source.seed : null) ?? null,
    ...(isBooksSource && source.seriesContext
      ? { seriesContext: source.seriesContext }
      : {}),
    ...(isBooksSource && source.collectionContext
      ? { collectionContext: source.collectionContext }
      : {}),
    defaultSort: forceDisplayMode
      ? {
          field: forceDisplayMode.sortMode,
          direction: forceDisplayMode.sortDirection,
        }
      : defaultSort,
  })

  const {
    queryArg,
    effectiveFilter,
    sort,
    setSort,
    isSearching,
    deferredSearch,
    activeFilterCount,
    clearAll,
  } = controller

  const tLabel = useTranslation("Common.fields.label")
  const sortFieldOptions = useMemo<
    { value: SortField; label: string }[]
  >(() => {
    const fields: SortField[] = [
      ...(extraSortFields ?? []),
      ...GENERAL_SORT_FIELDS,
    ]
    return fields.map((value) => ({ value, label: tLabel(value) }))
  }, [extraSortFields, tLabel])

  const booksQueryResult = useListInfiniteBooksInfiniteQuery(
    {
      ...queryArg,
      ...(isBooksSource && source.limit ? { limit: source.limit } : {}),
    },
    { skip: skip || !isBooksSource },
  )

  const shelfQueryArg = useMemo<ListShelfBooksQueryArg>(() => {
    const shelf = source.kind === "shelf" ? source : null
    const usesManualOrder =
      shelf?.orderBy === "position" && controller.isDefaultSort

    return {
      shelfUuid: shelf?.shelfUuid ?? "",
      ...(usesManualOrder
        ? {
            orderBy: "position" as const,
            orderDirection: shelf.orderDirection ?? "asc",
          }
        : { sortField: sort.field, orderDirection: sort.direction }),
      ...(deferredSearch ? { search: deferredSearch } : {}),
      ...(effectiveFilter ? { filter: effectiveFilter } : {}),
    }
  }, [source, sort, deferredSearch, effectiveFilter, controller.isDefaultSort])
  const shelfQueryResult = useListInfiniteShelfBooksInfiniteQuery(
    shelfQueryArg,
    { skip: skip || source.kind !== "shelf" },
  )

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = source.kind === "shelf" ? shelfQueryResult : booksQueryResult

  const books = useMemo(
    () => data?.pages.flatMap((page) => page) ?? [],
    [data?.pages],
  )

  const baselineQueryArg = useMemo<ListBooksQueryArg>(() => {
    if (!isBooksSource) return {}
    const arg: ListBooksQueryArg = {}
    if (source.seed) arg.filter = source.seed
    if (source.seriesContext) arg.series = source.seriesContext
    if (source.collectionContext) arg.collection = source.collectionContext
    return arg
  }, [isBooksSource, source])

  const { data: filteredCount } = useGetBooksCountQuery(queryArg, {
    skip: skip || !isBooksSource,
  })
  const { data: baselineCount } = useGetBooksCountQuery(baselineQueryArg, {
    skip: skip || !isBooksSource,
  })
  const { toggleSelection, selectAll } = useBookSelection()

  const alwaysLoadAll = useAppSelector(selectAlwaysLoadAllBooks)
  const [drainRequested, setDrainRequested] = useState(false)
  const shouldDrain = alwaysLoadAll || drainRequested
  const [requestSelectAll, setRequestSelectAll] = useState(false)

  const requestAllBooks = () => {
    setDrainRequested(true)
    setRequestSelectAll(true)
  }

  const selectAllEvent = useEffectEvent(() => {
    if (requestSelectAll) {
      selectAll(bookUuids)
      setRequestSelectAll(false)
    }
  })

  useEffect(() => {
    if (skip) return
    if (shouldDrain && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    } else if (drainRequested && !hasNextPage) {
      setDrainRequested(false)
      selectAllEvent()
    }
  }, [
    skip,
    shouldDrain,
    drainRequested,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ])

  const handleAlwaysLoadAllChange = useCallback(
    (value: boolean) => {
      dispatch(uiSettingsSlice.actions.setAlwaysLoadAllBooks(value))
    },
    [dispatch],
  )

  const handleLoadRemaining = useCallback(() => {
    setDrainRequested(true)
  }, [])

  const countIndicator = !skip ? (
    <BookCountIndicator
      loaded={books.length}
      filtered={isBooksSource ? filteredCount : undefined}
      total={isBooksSource ? baselineCount : undefined}
      hasMore={hasNextPage}
      isFetching={isFetchingNextPage}
      onLoadRemaining={handleLoadRemaining}
      alwaysLoadAll={alwaysLoadAll}
      onAlwaysLoadAllChange={handleAlwaysLoadAllChange}
    />
  ) : null

  const { selectedBookUuid, setSelectedBookUuid } = useBookInSidePanel()
  const { setReportMode } = useReportPanel()

  const selectedBook = useMemo(
    () => books.find((b) => b.uuid === selectedBookUuid),
    [books, selectedBookUuid],
  )

  const handleBookClick = useCallback(
    (
      book: { uuid: UUID },
      isSelectingArg: boolean,
      isBookSelected: boolean,
    ) => {
      if (isSelectingArg || isBookSelected) {
        toggleSelection(book.uuid)
        return
      }

      void setReportMode(bookClickMode === "report")
      void setSelectedBookUuid(book.uuid)
    },
    [toggleSelection, setReportMode, setSelectedBookUuid, bookClickMode],
  )

  const handleColumnClick = useCallback(
    (book: { uuid: UUID }) => {
      void setReportMode(true)
      void setSelectedBookUuid(book.uuid)
    },
    [setReportMode, setSelectedBookUuid],
  )

  const handleClosePanel = useCallback(() => {
    void setSelectedBookUuid(null)
    void setReportMode(false)
    requestAnimationFrame(() => {
      document.getElementById(BOOK_COLLECTION_ID)?.focus()
    })
  }, [setReportMode, setSelectedBookUuid])

  const handleColumnSort = useCallback(
    (field: SortField, direction: SortDirection) => {
      setSort(field, direction)
    },
    [setSort],
  )

  const bookUuids = useMemo(() => books.map((b) => b.uuid), [books])

  const selectedIndex =
    enableBookStepping && selectedBookUuid
      ? bookUuids.indexOf(selectedBookUuid)
      : -1

  useEffect(() => {
    if (!enableBookStepping || selectedIndex < 0) return

    const remaining = bookUuids.length - 1 - selectedIndex
    if (
      remaining <= NEXT_PREFETCH_MARGIN &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      void fetchNextPage()
    }
  }, [
    enableBookStepping,
    selectedIndex,
    bookUuids.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ])

  const goToNext = useMemo(() => {
    if (!enableBookStepping) return undefined
    const atEnd = selectedIndex >= bookUuids.length - 1
    if (selectedIndex < 0 || (atEnd && !hasNextPage)) return undefined
    return () => {
      const next = bookUuids[selectedIndex + 1]
      if (next) void setSelectedBookUuid(next)
    }
  }, [
    enableBookStepping,
    selectedIndex,
    bookUuids,
    hasNextPage,
    setSelectedBookUuid,
  ])

  const goToPrevious = useMemo(() => {
    if (!enableBookStepping || selectedIndex <= 0) return undefined
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return () => void setSelectedBookUuid(bookUuids[selectedIndex - 1]!)
  }, [enableBookStepping, selectedIndex, bookUuids, setSelectedBookUuid])

  const displayContext = useMemo<SortContext>(
    () => ({
      seriesUuid: (isBooksSource ? source.seriesContext : null) ?? null,
    }),
    [isBooksSource, source],
  )

  const displayFields = useMemo(
    () =>
      deriveDisplayFields(
        sort.field,
        effectiveFilter,
        displayContext,
        gridDisplayFields,
        controller.isDefaultSort,
      ),
    [
      sort.field,
      effectiveFilter,
      displayContext,
      gridDisplayFields,
      controller.isDefaultSort,
    ],
  )

  const showMuted =
    isSearching || (isFetching && !isFetchingNextPage && books.length > 0)

  const hasActiveFilters = !!deferredSearch || activeFilterCount > 0

  const contextValue = useMemo<BookListPageState>(
    () => ({
      controller,
      books,
      isLoading,
      selectedBookUuid,
      displayFields,
      displayContext,
    }),
    [
      controller,
      books,
      isLoading,
      selectedBookUuid,
      displayFields,
      displayContext,
    ],
  )

  const isMobile = useIsMobile()

  // add back if we have grid nav
  const focusCollection = useCallback(() => {
    document.getElementById(BOOK_COLLECTION_ID)?.focus()
  }, [])

  useHotkey("G", focusCollection, { ignoreInputs: true })

  const panelWidth = useAppSelector(
    (state) => state.uiSettings.detailPanelWidth,
  )
  const bookLayout = useAppSelector((state) => state.uiSettings.bookLayout)

  const panelOpen = !!selectedBookUuid
  const animate = useLayoutAnimations() && !isMobile

  const handlePanelWidthChange = useCallback(
    (width: number) => {
      dispatch(uiSettingsSlice.actions.setDetailPanelWidth(width))
    },
    [dispatch],
  )

  const { animatePanelOpen } = useUserPreferences()

  const gridCardSize = useAppSelector((state) => state.uiSettings.gridCardSize)
  const gridSpacing = useAppSelector((state) => state.uiSettings.gridSpacing)
  const cardWidth = GRID_CARD_WIDTHS[gridCardSize]
  const gridGap = GRID_SPACING_PX[gridSpacing]

  const pageLayoutRef = useRef<HTMLDivElement>(null)

  const GRID_PADDING = 48 // PageContent p-6 (24px each side)

  // TODO: remove?
  const snapChromeWidth = useCallback(
    (rawWidth: number, otherChrome: number, minW: number, maxW: number) => {
      const layoutWidth =
        pageLayoutRef.current?.offsetWidth ?? window.innerWidth

      const pitch = cardWidth + gridGap
      const available = layoutWidth - otherChrome - GRID_PADDING

      const gridWidth = available - rawWidth
      const idealCols = Math.max(1, Math.round((gridWidth + gridGap) / pitch))

      for (let delta = 0; delta <= idealCols; delta++) {
        for (const d of delta === 0 ? [0] : [-delta, delta]) {
          const cols = idealCols + d
          if (cols < 1) continue

          const chrome = available - (cols * pitch - gridGap)
          if (chrome >= minW && chrome <= maxW) return chrome
        }
      }

      return Math.max(
        minW,
        Math.min(maxW, available - (idealCols * pitch - gridGap)),
      )
    },
    [cardWidth, gridGap, GRID_PADDING],
  )

  const snapPanelWidth = useCallback(
    (raw: number) =>
      snapChromeWidth(
        raw,
        sidebar ? sidebarWidth : 0,
        MIN_PANEL_WIDTH,
        MAX_PANEL_WIDTH,
      ),
    [snapChromeWidth, sidebar, sidebarWidth],
  )

  const driver = usePanelWidthDriver({
    open: panelOpen && !isMobile,
    storedWidth: panelWidth,
    animate,
    animateOpenClose: animate && animatePanelOpen,
    slideMode: "transform",
    chromeEl: pageLayoutRef,
    snapOnRelease:
      !animate && bookLayout === "grid" ? snapPanelWidth : undefined,
    commit: handlePanelWidthChange,
  })

  const { state: sidebarState } = useSidebar()
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const prevSidebarState = useRef(sidebarState)
  useLayoutEffect(() => {
    if (prevSidebarState.current === sidebarState) return
    prevSidebarState.current = sidebarState
    setSidebarResizing(true)
    const id = setTimeout(() => {
      setSidebarResizing(false)
    }, 260)
    return () => {
      clearTimeout(id)
    }
  }, [sidebarState])

  const lastSelectedRef = useRef<{
    uuid: string
    book: BookWithRelations | undefined
  } | null>(null)
  useEffect(() => {
    if (selectedBookUuid) {
      lastSelectedRef.current = { uuid: selectedBookUuid, book: selectedBook }
    }
  }, [selectedBookUuid, selectedBook])

  const shownUuid =
    selectedBookUuid ??
    (animate && driver.visible ? lastSelectedRef.current?.uuid ?? null : null)
  const shownBook = selectedBookUuid
    ? selectedBook
    : lastSelectedRef.current?.book

  const snapRef = useRef({
    panelWidth,
    sidebarWidth,
    sidebar,
    dispatch,
  })
  snapRef.current = {
    panelWidth,
    sidebarWidth,
    sidebar,
    dispatch,
  }

  const [layoutWidth, setLayoutWidth] = useState(0)

  useEffect(() => {
    const el = pageLayoutRef.current
    if (!el) return

    setLayoutWidth(el.offsetWidth)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setLayoutWidth(Math.round(entry.contentRect.width))
    })

    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (layoutWidth === 0 || animate) return

    const { panelWidth, sidebarWidth, sidebar, dispatch } = snapRef.current
    const currentSidebar = sidebar ? sidebarWidth : 0

    if (panelOpen) {
      const snapped = snapChromeWidth(
        panelWidth,
        currentSidebar,
        MIN_PANEL_WIDTH,
        MAX_PANEL_WIDTH,
      )

      if (Math.abs(snapped - panelWidth) > 1) {
        dispatch(uiSettingsSlice.actions.setDetailPanelWidth(snapped))
      }
    }
  }, [panelOpen, cardWidth, layoutWidth, snapChromeWidth, animate])

  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    const returnFocus = () => {
      document.getElementById(BOOK_COLLECTION_ID)?.focus()
    }

    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      returnFocus()
      return
    }

    if (e.key === "ArrowLeft") {
      const t = e.target as HTMLElement
      const tag = t.tagName
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable ||
        t.getAttribute("role") === "slider"
      ) {
        return
      }
      e.preventDefault()
      returnFocus()
    }
  }, [])

  const coverScopeProps = useCoverScope(shownBook)
  useEscapeHandler(ESCAPE_PRIORITY.closePanel, handleClosePanel, panelOpen)

  const panelResizeState = useMemo(
    () => ({
      live: driver.dragging || driver.sliding || sidebarResizing,
      sliding: driver.phase !== null,
      pendingWidthDelta: driver.phase === "opening" ? -panelWidth : 0,
    }),
    [
      driver.dragging,
      driver.sliding,
      driver.phase,
      sidebarResizing,
      panelWidth,
    ],
  )

  const descriptionText = description ? (
    <div className="max-w-md pt-1 pr-6 pb-3 pl-5">
      <CollapsibleText
        key={description}
        collapsedHeight={DESCRIPTION_LINE_HEIGHT * (isMobile ? 1 : 3)}
        className="text-muted-foreground text-sm"
      >
        {description}
      </CollapsibleText>
    </div>
  ) : null

  if (isMobile) {
    return (
      <>
        <PageLayout>
          <PageMain>
            <SkipToBooksLink />
            <PageHeader>
              <SiteHeader
                breadcrumbs={breadcrumbs}
                actions={headerActions}
                afterTitle={countIndicator}
              />
            </PageHeader>

            {descriptionText}
            {banner}

            <PageContent className={"relative p-6 pt-0 md:p-0"}>
              <BookFilters
                className={cn(filtersClassName, descriptionText && "pt-1")}
                controller={controller}
                seedLabel={seedLabel}
                sortOptions={sortFieldOptions}
                onSortChange={setSort}
                displayOverrides={gridDisplayFields}
                onDisplayOverridesChange={handleDisplayFieldsChange}
                currentFields={displayFields}
                forceLayout={forceDisplayMode?.layout}
              />
              <BooksView
                books={books}
                isLoading={isLoading}
                isFetchingNextPage={isFetchingNextPage}
                hasNextPage={hasNextPage}
                fetchNextPage={fetchNextPage}
                showMuted={showMuted}
                emptyMessage={emptyMessage}
                emptySubMessage={
                  hasActiveFilters ? emptyFilteredSubMessage : emptySubMessage
                }
                onClearFilters={clearAll}
                hasActiveFilters={activeFilterCount > 0}
                selectedBookUuid={selectedBookUuid}
                onBookClick={handleBookClick}
                onColumnClick={handleColumnClick}
                displayFields={displayFields}
                listDisplayFieldsOverride={listDisplayFields}
                displayContext={displayContext}
                sortField={sort.field}
                sortDirection={sort.direction}
                onSortChange={handleColumnSort}
                forceLayout={forceDisplayMode?.layout}
              />
            </PageContent>
          </PageMain>
        </PageLayout>

        <BookDetailDrawer
          selectedBookUuid={selectedBookUuid}
          selectedBook={selectedBook}
          onClose={handleClosePanel}
          nextBook={goToNext}
          previousBook={goToPrevious}
        />
      </>
    )
  }

  return (
    <BookListPageContext.Provider value={contextValue}>
      <PanelResizeProvider value={panelResizeState}>
        <PageLayout ref={pageLayoutRef}>
          {sidebar && (
            <PageSidebar
              width={sidebarWidth}
              onWidthChange={handleSidebarWidthChange}
            >
              {sidebar}
            </PageSidebar>
          )}

          <PageMain>
            <SkipToBooksLink />
            <PageHeader>
              <SiteHeader
                breadcrumbs={breadcrumbs}
                actions={headerActions}
                afterTitle={countIndicator}
              />
            </PageHeader>

            {descriptionText}
            {banner}

            <PageContent
              className={cn(contentClassName ?? "p-6 pt-0", "relative")}
            >
              <BookFilters
                className={cn(filtersClassName, descriptionText && "pt-1")}
                controller={controller}
                seedLabel={seedLabel}
                sortOptions={sortFieldOptions}
                onSortChange={setSort}
                displayOverrides={gridDisplayFields}
                onDisplayOverridesChange={handleDisplayFieldsChange}
                currentFields={displayFields}
                forceLayout={forceDisplayMode?.layout}
              />
              <BooksView
                books={books}
                isLoading={isLoading}
                isFetchingNextPage={isFetchingNextPage}
                hasNextPage={hasNextPage}
                fetchNextPage={fetchNextPage}
                showMuted={showMuted}
                emptyMessage={emptyMessage}
                emptySubMessage={
                  hasActiveFilters ? emptyFilteredSubMessage : emptySubMessage
                }
                onClearFilters={clearAll}
                hasActiveFilters={activeFilterCount > 0}
                selectedBookUuid={selectedBookUuid}
                onBookClick={handleBookClick}
                onColumnClick={handleColumnClick}
                displayFields={
                  forceDisplayMode
                    ? forceDisplayMode.displayFields
                    : displayFields
                }
                listDisplayFieldsOverride={listDisplayFields}
                displayContext={displayContext}
                sortField={sort.field}
                sortDirection={sort.direction}
                forceLayout={forceDisplayMode?.layout}
                onSortChange={handleColumnSort}
              />

              <SelectionToolbar
                books={books}
                requestAllBooks={requestAllBooks}
                allBooksCount={baselineCount ?? 0}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
              />
            </PageContent>
          </PageMain>

          <PagePanel
            open={driver.visible}
            width={panelWidth}
            phase={driver.phase}
            panelRef={driver.panelRef}
            onResizeStart={driver.startDrag}
            dragging={driver.dragging}
            colors={coverScopeProps}
          >
            {shownUuid && (
              <div
                id={BOOK_DETAIL_PANEL_ID}
                role="region"
                aria-label="Book details"
                tabIndex={-1}
                onKeyDown={handlePanelKeyDown}
                className="flex h-full w-full flex-col outline-none"
              >
                <DynamicBookDetailsContent
                  uuid={shownUuid as UUID}
                  initialBook={shownBook}
                  compact
                  onClose={handleClosePanel}
                  nextBook={goToNext}
                  previousBook={goToPrevious}
                />
              </div>
            )}
          </PagePanel>
        </PageLayout>
      </PanelResizeProvider>
    </BookListPageContext.Provider>
  )
}

export function BookListPage(props: BookListPageProps) {
  return (
    <BookSelectionProvider>
      <BookListPageInner {...props} />
    </BookSelectionProvider>
  )
}

// a11y skip link
export function SkipToBooksLink() {
  return (
    <a
      href={`#${BOOK_COLLECTION_ID}`}
      onClick={(e) => {
        e.preventDefault()
        document.getElementById(BOOK_COLLECTION_ID)?.focus()
      }}
      className="bg-background focus:ring-primary sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:border focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:outline-none"
    >
      Skip to books
    </a>
  )
}

// mobile
export function BookDetailDrawer({
  selectedBookUuid,
  selectedBook,
  onClose,
  nextBook,
  previousBook,
}: {
  selectedBookUuid: string | null
  selectedBook?: BookWithRelations
  onClose: () => void
  nextBook?: () => void
  previousBook?: () => void
}) {
  const lastSelectedRef = useRef<{
    uuid: string
    book: BookWithRelations | undefined
  } | null>(null)
  useEffect(() => {
    if (selectedBookUuid) {
      lastSelectedRef.current = { uuid: selectedBookUuid, book: selectedBook }
    }
  }, [selectedBookUuid, selectedBook])

  const shownUuid = selectedBookUuid ?? lastSelectedRef.current?.uuid ?? null
  const shownBook = selectedBookUuid
    ? selectedBook
    : lastSelectedRef.current?.book

  return (
    <Drawer.Root
      open={!!selectedBookUuid}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />

        <Drawer.Content className="bg-background fixed right-0 bottom-0 left-0 z-40 flex h-[85svh] flex-col overflow-hidden rounded-t-2xl">
          <div
            id="book-detail-drawer-handle"
            className="bg-muted-foreground/20 relative z-10 mx-auto mt-4 -mb-6 h-1.5 w-12 shrink-0 rounded-full"
          />

          <Drawer.Title className="sr-only">Book Details</Drawer.Title>

          {shownUuid && (
            <DynamicBookDetailsContent
              uuid={shownUuid as UUID}
              initialBook={shownBook}
              compact
              onClose={onClose}
              nextBook={nextBook}
              previousBook={previousBook}
            />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
