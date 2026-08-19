import { useCallback, useRef } from "react"

import { type FacetSection } from "@/database/libraryCounts"
import { type SidebarItemDetail } from "@/database/sidebar"
import { api } from "@/store/api"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { selectDefaultSorts } from "@/store/slices/uiSettingsSlice"

const BUILTIN_TO_SECTION: Partial<Record<string, FacetSection>> = {
  series: "series",
  authors: "authors",
  narrators: "narrators",
  translators: "translators",
  tags: "tags",
  "publication-years": "publicationYears",
  ratings: "ratings",
  statuses: "statuses",
  formats: "formats",
}

const HOVER_INTENT_MS = 75

export function useSidebarPrefetch() {
  const dispatch = useAppDispatch()
  const defaultSorts = useAppSelector(selectDefaultSorts)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prefetch = useCallback(
    (item: SidebarItemDetail) => {
      if (item.kind === "builtin" && item.builtinKey) {
        const key = item.builtinKey

        if (key === "books") {
          const saved = defaultSorts["books"]

          void dispatch(
            api.endpoints.listInfiniteBooks.initiate(
              {
                orderBy: saved?.field ?? "createdAt",
                orderDirection: saved?.direction ?? "desc",
              },
              { subscribe: false },
            ),
          )
          return
        }

        const sectionKey = BUILTIN_TO_SECTION[key]
        if (sectionKey) {
          void dispatch(
            api.endpoints.getSectionFacets.initiate(
              { section: sectionKey },
              { subscribe: false },
            ),
          )

          // also prefetch books for sections that have a known default sort
          // TODO: figure out the correct way to do this

          return
        }

        // home, alignment-quality, etc. - nothing useful to prefetch
        return
      }

      if (item.kind === "collection" && item.collectionUuid) {
        void dispatch(
          api.endpoints.listInfiniteBooks.initiate(
            { collection: item.collectionUuid },
            { subscribe: false },
          ),
        )
        return
      }

      if (item.kind === "shelf" && item.shelfUuid) {
        void dispatch(
          api.endpoints.listInfiniteShelfBooks.initiate(
            { shelfUuid: item.shelfUuid },
            { subscribe: false },
          ),
        )
        return
      }
    },
    [dispatch, defaultSorts],
  )

  const handlePointerEnter = useCallback(
    (item: SidebarItemDetail) => {
      if (timerRef.current) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
        prefetch(item)
        timerRef.current = null
      }, HOVER_INTENT_MS)
    },
    [prefetch],
  )

  const handlePointerLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return { handlePointerEnter, handlePointerLeave }
}
