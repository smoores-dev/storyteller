"use client"

import { usePathname } from "next/navigation"
import { createParser, parseAsString, useQueryState } from "nuqs"
import { useCallback, useDeferredValue, useMemo, useState } from "react"
import { useThrottledCallback } from "use-debounce"

import {
  type ShelfFilterAnd,
  type ShelfFilterCondition,
  type ShelfFilterField,
  type ShelfFilterNode,
  createAndBlock,
  shelfFilterRootSchema,
} from "@/shelves"
import {
  type BookSort,
  type DisplayField,
  type SortDirection,
  type SortField,
} from "@/sort"
import { type ListBooksQueryArg } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  selectDefaultSorts,
  uiSettingsSlice,
} from "@/store/slices/uiSettingsSlice"
import { type UUID } from "@/uuid"

const EXCLUDED_SORT_SAVE_PAGES = ["shelves", "quality"]

export function sortPageKey(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean)
  const [first, second] = segments
  return (first === "v3" ? second : first) ?? ""
}

type UseBookFiltersOptions = {
  seed?: ShelfFilterNode | null
  seriesContext?: UUID
  collectionContext?: UUID
  defaultSort?: BookSort[number]
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const createSortParser = <Field extends string>() => {
  return createParser<{ field: Field; direction: SortDirection }>({
    parse(queryValue) {
      const [field, direction] = queryValue.split(":")
      if (!field) return null
      if (direction !== "asc" && direction !== "desc") return null
      return { field: field as Field, direction }
    },
    serialize(value) {
      return `${value.field}:${value.direction}`
    },
    eq(a, b) {
      return a.field === b.field && a.direction === b.direction
    },
  }).withOptions({ shallow: true, history: "replace" })
}

const sortParser = createSortParser<SortField>()

const EMPTY_FILTER: ShelfFilterAnd = createAndBlock([])

const filterParser = createParser({
  parse(queryValue): ShelfFilterNode | null {
    try {
      const parsed: unknown = JSON.parse(queryValue)
      const result = shelfFilterRootSchema.safeParse(parsed)
      if (!result.success) return null
      return result.data as ShelfFilterNode
    } catch {
      return null
    }
  },
  serialize(value: ShelfFilterNode) {
    return JSON.stringify(value)
  },
  eq(a, b) {
    return JSON.stringify(a) === JSON.stringify(b)
  },
})
  .withOptions({ shallow: true, history: "replace" })
  .withDefault(EMPTY_FILTER)

function isConditionNode(node: ShelfFilterNode): node is ShelfFilterCondition {
  return node.type === "condition"
}

function asSimpleAnd(node: ShelfFilterNode): ShelfFilterCondition[] | null {
  if (node.type !== "and") return null
  if (!node.children.every(isConditionNode)) return null
  return node.children
}

function replaceFieldConditions(
  children: ShelfFilterNode[],
  field: ShelfFilterField,
  conds: ShelfFilterCondition[],
): ShelfFilterNode[] {
  const out: ShelfFilterNode[] = []
  let inserted = false
  for (const child of children) {
    if (child.type === "condition" && child.field === field) {
      if (!inserted) {
        out.push(...conds)
        inserted = true
      }
      continue
    }
    out.push(child)
  }
  if (!inserted) out.push(...conds)
  return out
}

const defaultSortDefault = {
  field: "createdAt",
  direction: "desc",
} as const

export function useBookFilters(options: UseBookFiltersOptions = {}) {
  const pathName = usePathname()
  const currentPage = sortPageKey(pathName)
  const canSaveSort = !EXCLUDED_SORT_SAVE_PAGES.includes(currentPage)
  const defaultSorts = useAppSelector(selectDefaultSorts)
  const defaultSort = canSaveSort
    ? (defaultSorts[currentPage] ?? options.defaultSort ?? defaultSortDefault)
    : (options.defaultSort ?? defaultSortDefault)

  const [userFilter, setUserFilterRaw] = useQueryState("f", filterParser)
  const [searchQueryParam, setSearchQueryParam] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({
      shallow: true,
      history: "replace",
    }),
  )
  const [searchValue, setSearchValue] = useState(searchQueryParam)

  const [sort, setSortRaw] = useQueryState(
    "sort",
    sortParser.withDefault({
      field: defaultSort.field,
      direction: defaultSort.direction,
    }),
  )
  const deferredSearch = useDeferredValue(searchQueryParam)
  const isSearching = searchValue !== deferredSearch

  const simpleConditions = asSimpleAnd(userFilter)
  const isAdvanced = simpleConditions === null

  const activeFields = useMemo(() => {
    if (!simpleConditions) return []
    const seen = new Set<ShelfFilterField>()
    const order: ShelfFilterField[] = []
    for (const c of simpleConditions) {
      if (!seen.has(c.field)) {
        seen.add(c.field)
        order.push(c.field)
      }
    }
    return order
  }, [simpleConditions])

  const conditionsForField = useCallback(
    (field: ShelfFilterField): ShelfFilterCondition[] =>
      simpleConditions?.filter((c) => c.field === field) ?? [],
    [simpleConditions],
  )

  const setConditionsForField = useCallback(
    (field: ShelfFilterField, conds: ShelfFilterCondition[]) => {
      void setUserFilterRaw((prev) => {
        const root = prev
        if (root.type !== "and") return root
        const next = replaceFieldConditions(root.children, field, conds)
        return next.length ? { type: "and", children: next } : EMPTY_FILTER
      })
    },
    [setUserFilterRaw],
  )

  const removeField = useCallback(
    (field: ShelfFilterField) => {
      setConditionsForField(field, [])
    },
    [setConditionsForField],
  )

  const setUserFilter = useCallback(
    (node: ShelfFilterNode | null) => {
      void setUserFilterRaw(node ?? EMPTY_FILTER)
    },
    [setUserFilterRaw],
  )

  const setSearchThrottled = useThrottledCallback((value: string) => {
    void setSearchQueryParam(value)
  }, 500)
  const setSearch = useCallback(
    (value: string) => {
      setSearchValue(value)
      setSearchThrottled(value)
    },
    [setSearchValue, setSearchThrottled],
  )

  const dispatch = useAppDispatch()
  const setSort = useCallback(
    (field: SortField, direction: SortDirection) => {
      void setSortRaw({ field, direction })
      if (currentPage && canSaveSort) {
        void dispatch(
          uiSettingsSlice.actions.setDefaultSort({
            page: currentPage,
            sort: { field, direction },
          }),
        )
      }
    },
    [setSortRaw, dispatch, currentPage, canSaveSort],
  )

  const clearAll = useCallback(() => {
    void setUserFilterRaw(EMPTY_FILTER)
    setSearchValue("")
    void setSearchQueryParam("")
  }, [setUserFilterRaw, setSearchValue, setSearchQueryParam])

  const userHasContent =
    userFilter.type !== "and" || userFilter.children.length > 0

  const effectiveFilter = useMemo<ShelfFilterNode | undefined>(() => {
    const seed = options.seed ?? null
    if (seed && userHasContent)
      return { type: "and", children: [seed, userFilter] }
    if (seed) return seed
    if (userHasContent) return userFilter
    return undefined
  }, [options.seed, userFilter, userHasContent])

  const queryArg = useMemo<ListBooksQueryArg>(() => {
    const arg: ListBooksQueryArg = {
      orderBy: sort.field,
      orderDirection: sort.direction,
    }
    if (deferredSearch) arg.search = deferredSearch
    if (effectiveFilter) arg.filter = effectiveFilter
    if (options.seriesContext) arg.series = options.seriesContext
    if (options.collectionContext) arg.collection = options.collectionContext
    return arg
  }, [
    sort,
    deferredSearch,
    effectiveFilter,
    options.seriesContext,
    options.collectionContext,
  ])

  const activeFilterCount = isAdvanced
    ? 1
    : activeFields.length + (searchQueryParam ? 1 : 0)

  const isDefaultSort =
    sort.field === (options.defaultSort?.field ?? "createdAt") &&
    sort.direction === (options.defaultSort?.direction ?? "desc")

  const baseSort = options.defaultSort ?? defaultSortDefault
  const hasSavedSort = !!defaultSorts[currentPage]
  const canResetSort =
    hasSavedSort ||
    sort.field !== baseSort.field ||
    sort.direction !== baseSort.direction

  const resetSort = useCallback(() => {
    void setSortRaw({ field: baseSort.field, direction: baseSort.direction })
    void dispatch(
      uiSettingsSlice.actions.clearDefaultSort({ page: currentPage }),
    )
  }, [setSortRaw, dispatch, currentPage, baseSort.field, baseSort.direction])

  return {
    canResetSort,
    resetSort,
    userFilter,
    isAdvanced,
    seed: options.seed ?? null,
    effectiveFilter,
    activeFields,
    conditionsForField,
    setConditionsForField,
    removeField,
    setUserFilter,
    search: searchValue,
    setSearch,
    sort,
    setSort,
    isDefaultSort,
    queryArg,
    isSearching,
    deferredSearch,
    activeFilterCount,
    clearAll,
  }
}

export type BookFiltersController = ReturnType<typeof useBookFilters>
export type { DisplayField, SortDirection, SortField }
