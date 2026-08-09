"use client"

import { useCallback, useMemo } from "react"

import { toSidebarGroupInputs } from "@v3/_/components/nav/sidebar-payload"

import { type SidebarItemKind } from "@/database/sidebar"
import {
  useListSidebarGroupsQuery,
  useSetSidebarGroupsMutation,
} from "@/store/api"

// collections and shelves live in the app sidebar as rows that can be hidden
// (never deleted, see the reconcile-on-read model in database/sidebar.ts). the
// library views surface that state per facet row, and can toggle it.
export function useSidebarVisibility() {
  const { data: sidebarGroups = [] } = useListSidebarGroupsQuery()
  const [setSidebarGroups, { isLoading: isSaving }] =
    useSetSidebarGroupsMutation()

  const hiddenUuids = useMemo(() => {
    const hidden = new Set<string>()
    for (const group of sidebarGroups) {
      for (const item of group.items) {
        if (!item.hidden && !group.hidden) continue
        const uuid = item.collectionUuid ?? item.shelfUuid
        if (uuid) hidden.add(uuid)
      }
    }
    return hidden
  }, [sidebarGroups])

  const isHidden = useCallback(
    (uuid: string) => hiddenUuids.has(uuid),
    [hiddenUuids],
  )

  const setHidden = useCallback(
    (
      kind: Extract<SidebarItemKind, "collection" | "shelf">,
      uuid: string,
      hidden: boolean,
    ) => {
      const key = kind === "collection" ? "collectionUuid" : "shelfUuid"

      const updated = toSidebarGroupInputs(sidebarGroups, {
        item: (item) => (item[key] === uuid ? { hidden } : {}),
        group: (group) =>
          !hidden && group.items.some((item) => item[key] === uuid)
            ? { hidden: false }
            : {},
      })

      return setSidebarGroups(updated).unwrap()
    },
    [sidebarGroups, setSidebarGroups],
  )

  return { isHidden, setHidden, isSaving }
}
