"use client"

import { parseAsString, useQueryState } from "nuqs"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  BookListPage,
  type BookListSource,
  type ForceDisplayMode,
} from "@v3/_/components/books/BookListPage"
import { EntityActionsMenu } from "@v3/_/components/library/EntityActionsMenu"
import {
  LibrarySidebar,
  type SidebarSortDirection,
  type SidebarSortMode,
} from "@v3/_/components/library/LibrarySidebar"
import {
  ALL_KEY,
  type FacetValue,
  type LibrarySectionDef,
  NONE_KEY,
  sectionSeedQueryArg,
} from "@v3/_/components/library/library-sections"
import { Dialog, DialogContent } from "@v3/_/components/ui/dialog"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { type BookFiltersController } from "@v3/_/hooks/use-book-filters"
import { DocumentTitle } from "@v3/_/hooks/use-document-title"
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { useBookInSidePanel } from "@v3/_/hooks/use-open-book"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"
import { type DisplayField, type SortField } from "@/sort"
import {
  api,
  useGetSectionFacetsQuery,
  useListCollectionsQuery,
  useListSeriesQuery,
  useListUserShelvesQuery,
} from "@/store/api"
import { useAppDispatch } from "@/store/appState"
import { type UUID } from "@/uuid"

type LibraryPageProps = {
  title: string
  section: LibrarySectionDef
  defaultSidebarSort?: SidebarSortMode
  initialSelectedItem?: string
  noneLabel?: string
  itemLabels?: Record<string, string>
  bookClickMode?: "panel" | "report"
  contentClassName?: string
  emptyMessage?: string
  emptyFilteredSubMessage?: string
  listDisplayFields?: DisplayField[]
  forceDisplayMode?: ForceDisplayMode
}

export function LibraryPage({
  title,
  section,
  defaultSidebarSort = "name",
  initialSelectedItem,
  noneLabel,
  itemLabels,
  bookClickMode,
  contentClassName,
  emptyMessage,
  emptyFilteredSubMessage,
  listDisplayFields,
  forceDisplayMode,
}: LibraryPageProps) {
  const t = useTranslation("LibraryPage")
  const c = useCommon()
  const isMobile = useIsMobile()
  const dispatch = useAppDispatch()

  const { data: facets, isLoading: facetsLoading } = useGetSectionFacetsQuery({
    section: section.key,
  })

  const [selectedItem, setSelectedItem] = useQueryState("item", parseAsString)
  const { setSelectedBookUuid } = useBookInSidePanel()

  const [sidebarSearch, setSidebarSearch] = useState("")
  const [sidebarSort, setSidebarSort] =
    useState<SidebarSortMode>(defaultSidebarSort)
  const [sidebarSortDirection, setSidebarSortDirection] =
    useState<SidebarSortDirection>(
      defaultSidebarSort === "count" ? "desc" : "asc",
    )

  const handleSortChange = useCallback(
    (mode: SidebarSortMode, direction: SidebarSortDirection) => {
      setSidebarSort(mode)
      setSidebarSortDirection(direction)
    },
    [],
  )

  const isSeriesSection = section.entityType === "series"

  const allItems = useMemo<FacetValue[]>(() => {
    if (!facets) return []

    const items = facets.flatMap((facet) => {
      if (facet.key === NONE_KEY) {
        if (!noneLabel) return []
        return [{ key: NONE_KEY, name: noneLabel, bookCount: facet.bookCount }]
      }

      return [
        {
          key: facet.key,
          name: itemLabels?.[facet.key] ?? facet.name,
          bookCount: facet.bookCount,
          icon: facet.icon,
          color: section.itemColor?.(facet.key) ?? facet.color,
          kind: facet.kind,
          ...(facet.filterIssues ? { filterIssues: facet.filterIssues } : {}),
        },
      ]
    })

    if (section.allFilter) {
      items.unshift({
        key: ALL_KEY,
        name: itemLabels?.[ALL_KEY] ?? t("allItems"),
        bookCount: items.reduce((sum, item) => sum + item.bookCount, 0),
      })
    }

    return items
  }, [facets, noneLabel, itemLabels, section, t])

  const visibleItems = useMemo(() => {
    let items = allItems

    if (sidebarSearch) {
      const term = sidebarSearch.toLowerCase()
      items = items.filter((item) => item.name.toLowerCase().includes(term))
    }

    const compareNames =
      section.compareItems ??
      ((a: FacetValue, b: FacetValue) => a.name.localeCompare(b.name))

    const allFirst = (a: FacetValue, b: FacetValue) =>
      Number(b.key === ALL_KEY) - Number(a.key === ALL_KEY)

    const pinned = section.pinItem
      ? (a: FacetValue, b: FacetValue) =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-call
          Number(section.pinItem!(b)) - Number(section.pinItem!(a))
      : () => 0

    const dir = sidebarSortDirection === "asc" ? 1 : -1

    if (sidebarSort === "name") {
      items = [...items].sort(
        (a, b) => allFirst(a, b) || pinned(a, b) || dir * compareNames(a, b),
      )
    } else {
      items = [...items].sort(
        (a, b) =>
          allFirst(a, b) ||
          pinned(a, b) ||
          dir * (a.bookCount - b.bookCount) ||
          compareNames(a, b),
      )
    }

    return items
  }, [
    allItems,
    sidebarSearch,
    sidebarSort,
    sidebarSortDirection,
    section.compareItems,
    section.pinItem,
  ])

  const didAutoSelectRef = useRef(false)

  useEffect(() => {
    if (selectedItem || didAutoSelectRef.current || isMobile) return

    const initial =
      initialSelectedItem && allItems.some((i) => i.key === initialSelectedItem)
        ? initialSelectedItem
        : visibleItems.find((i) => i.key !== NONE_KEY)?.key

    if (initial) {
      didAutoSelectRef.current = true
      void setSelectedItem(initial)
    }
  }, [
    selectedItem,
    isMobile,
    visibleItems,
    allItems,
    initialSelectedItem,
    setSelectedItem,
  ])

  const selectedFacet = allItems.find((i) => i.key === selectedItem)
  const selectedItemName = selectedFacet?.name
  const documentTitle =
    selectedItem && selectedItem !== ALL_KEY && selectedItem !== NONE_KEY
      ? selectedItemName ?? title
      : title

  const handleItemClick = useCallback(
    (key: string) => {
      void setSelectedItem(key)
    },
    [setSelectedItem],
  )

  const prefetchDepsRef = useRef(section)
  prefetchDepsRef.current = section
  const handleHoverItem = useCallback(
    (key: string, controller?: BookFiltersController) => {
      if (!controller) return
      const sec = prefetchDepsRef.current
      void dispatch(
        api.endpoints.listInfiniteBooks.initiate(
          {
            orderBy: controller.sort.field,
            orderDirection: controller.sort.direction,
            ...(controller.deferredSearch
              ? { search: controller.deferredSearch }
              : {}),
            ...sectionSeedQueryArg(sec, key),
          },
          { subscribe: false },
        ),
      )
    },
    [dispatch],
  )

  const handleBackToList = useCallback(() => {
    void setSelectedItem(null)
    void setSelectedBookUuid(null)
  }, [setSelectedItem, setSelectedBookUuid])

  const seedArg = useMemo(
    () => (selectedItem ? sectionSeedQueryArg(section, selectedItem) : {}),
    [section, selectedItem],
  )

  const isShelfSection = section.entityType === "shelf"
  const { data: shelves = [] } = useListUserShelvesQuery(undefined, {
    skip: !isShelfSection,
  })
  const selectedShelf =
    isShelfSection && selectedItem
      ? shelves.find((shelf) => shelf.uuid === selectedItem)
      : undefined

  const { data: describableCollections = [] } = useListCollectionsQuery(
    undefined,
    { skip: section.entityType !== "collection" },
  )
  const { data: describableSeries = [] } = useListSeriesQuery(undefined, {
    skip: !isSeriesSection,
  })
  const selectedDescription =
    selectedItem && selectedItem !== NONE_KEY && selectedItem !== ALL_KEY
      ? selectedShelf?.description ??
        describableCollections.find((c) => c.uuid === selectedItem)
          ?.description ??
        describableSeries.find((s) => s.uuid === selectedItem)?.description
      : undefined

  const source = useMemo<BookListSource>(() => {
    if (selectedShelf) {
      return {
        kind: "shelf",
        shelfUuid: selectedShelf.uuid,
        orderBy: selectedShelf.orderBy,
        orderDirection:
          selectedShelf.orderDirection === "asc" ? "asc" : ("desc" as const),
      }
    }

    return {
      kind: "books",
      seed: seedArg.filter ?? null,
      ...(seedArg.series ? { seriesContext: seedArg.series as UUID } : {}),
      ...(seedArg.collection
        ? { collectionContext: seedArg.collection as UUID }
        : {}),
    }
  }, [seedArg, selectedShelf])

  const shelfDefaultSort = useMemo(() => {
    if (!selectedShelf?.orderBy || selectedShelf.orderBy === "position") {
      return undefined
    }
    return {
      field: selectedShelf.orderBy as SortField,
      direction:
        selectedShelf.orderDirection === "asc"
          ? ("asc" as const)
          : ("desc" as const),
    }
  }, [selectedShelf])

  const headerActions = selectedFacet && selectedFacet.key !== NONE_KEY && (
    <EntityActionsMenu
      entityType={section.entityType}
      item={selectedFacet}
      toShelfFilter={section.toShelfFilter}
      isItemLocked={section.isItemLocked}
      onDeleted={() => {
        void setSelectedItem(null)
      }}
    />
  )

  const sidebar = (
    <LibrarySidebar
      title={title}
      items={visibleItems}
      selectedKey={selectedItem}
      isLoading={facetsLoading}
      search={sidebarSearch}
      onSearchChange={setSidebarSearch}
      sortMode={sidebarSort}
      sortDirection={sidebarSortDirection}
      onSortChange={handleSortChange}
      onItemClick={handleItemClick}
      onHoverItem={handleHoverItem}
      entityType={section.entityType}
      toShelfFilter={section.toShelfFilter}
      isItemLocked={section.isItemLocked}
    />
  )

  return (
    <>
      <DocumentTitle parts={[documentTitle]} />
      <BookListPage
        forceDisplayMode={forceDisplayMode}
        source={source}
        skip={!selectedItem}
        seedLabel={selectedItemName}
        defaultSort={shelfDefaultSort ?? section.sort}
        {...(isSeriesSection ? { extraSortFields: ["seriesPosition"] } : {})}
        breadcrumbs={
          isMobile
            ? [
                { label: title },
                ...(selectedItemName ? [{ label: selectedItemName }] : []),
              ]
            : [{ label: selectedItemName ?? title }]
        }
        headerActions={
          <>
            {isMobile && (
              <TooltipButton
                tooltip={c("actions.back")}
                aria-label={c("actions.back")}
                className="bg-background/90 rounded-full backdrop-blur"
                variant="secondary"
                size="sm"
                onClick={handleBackToList}
              >
                <icon.ArrowLeft className="size-3.5 stroke-[1.5]" />
              </TooltipButton>
            )}
            {headerActions}
          </>
        }
        sidebar={sidebar}
        description={selectedDescription}
        bookClickMode={bookClickMode}
        contentClassName={contentClassName}
        listDisplayFields={listDisplayFields}
        emptyMessage={emptyMessage}
        emptySubMessage={t("emptyStateSub")}
        emptyFilteredSubMessage={emptyFilteredSubMessage}
      />

      {/* on mobile the facet list lives in a dialog until an item is picked */}
      {isMobile && (
        <Dialog open={!selectedItem} defaultOpen={!selectedItem}>
          <DialogContent>{sidebar}</DialogContent>
        </Dialog>
      )}
    </>
  )
}
