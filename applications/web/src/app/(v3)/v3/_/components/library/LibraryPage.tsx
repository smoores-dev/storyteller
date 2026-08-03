"use client"

import { parseAsString, useQueryState } from "nuqs"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

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
import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { useBookInSidePanel } from "@v3/_/hooks/use-open-book"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import * as icon from "@/icons"
import { type DisplayField, type SortField } from "@/sort"
import {
  api,
  useGetSectionFacetsQuery,
  useListUserShelvesQuery,
} from "@/store/api"
import { useAppDispatch } from "@/store/appState"
import { type UUID } from "@/uuid"

type LibraryPageProps = {
  title: string
  section: LibrarySectionDef
  defaultSidebarSort?: SidebarSortMode
  // preselect a facet on first load (e.g. a specific collection from its route)
  // when there's no `item` query param yet.
  initialSelectedItem?: string
  // label for the "(no X)" entry shown when the section has filterNone
  noneLabel?: string
  // map format keys (or other synthetic keys) to display labels
  itemLabels?: Record<string, string>

  // slot passthrough to BookListPage, for routes that customize the shell
  beforeFilters?: ReactNode
  afterFilters?: ReactNode
  bookClickMode?: "panel" | "report"
  contentClassName?: string
  emptyMessage?: string
  emptyFilteredSubMessage?: string
  // force the list/table layout's columns for this page, overriding the global
  // listDisplayFields preference (e.g. quality shows only alignment fields).
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
  beforeFilters,
  afterFilters,
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

    // to be sure they are sorted alphabetically
    // otherwise jess will yell at you
    const compareNames =
      section.compareItems ??
      ((a: FacetValue, b: FacetValue) => a.name.localeCompare(b.name))

    // the "all" row stays pinned at the top regardless of the sort mode
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

  // auto-select the initial item if it's not already selected and we're not on mobile
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

  const handleItemClick = useCallback(
    (key: string) => {
      void setSelectedItem(key)
    },
    [setSelectedItem],
  )

  // warm the books query on hover. the sidebar hands back the live filter
  // controller so the prefetch arg matches the real query's cache key.
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

  // selected facet becomes the seed of the books query
  const seedArg = useMemo(
    () => (selectedItem ? sectionSeedQueryArg(section, selectedItem) : {}),
    [section, selectedItem],
  )

  // a shelf's membership can't be expressed as a filter (it may be a manual
  // list), so picking one switches the grid onto the shelf source, carrying the
  // shelf's own ordering the way the dedicated shelf page does
  const isShelfSection = section.entityType === "shelf"
  const { data: shelves = [] } = useListUserShelvesQuery(undefined, {
    skip: !isShelfSection,
  })
  const selectedShelf =
    isShelfSection && selectedItem
      ? shelves.find((shelf) => shelf.uuid === selectedItem)
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
        beforeFilters={beforeFilters}
        afterFilters={afterFilters}
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
