"use client"

import { useMemo } from "react"

import { useCommon } from "@v3/_/hooks/use-translation"

import { RelationSelectList } from "@/app/(v3)/v3/_/components/books/relation-picker/RelationSelectList"
import { type BookWithRelations } from "@/database/books"
import { statusDisplayLabel } from "@/database/statusKinds"
import {
  useListStatusesQuery,
  useUpdateReadingStatusMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

// the synthetic row that clears the status; it rides along as a normal item so
// it stays keyboard-reachable in the virtualized list.
const NONE = "__none__"

export function SetStatusList({
  books,
  bookUuids,
}: {
  books: BookWithRelations[]
  bookUuids: UUID[]
}) {
  const c = useCommon()
  const { data: statuses = [], isLoading } = useListStatusesQuery()
  const [updateReadingStatus] = useUpdateReadingStatusMutation()

  const items = useMemo(
    () => [
      ...statuses.map((status) => ({
        uuid: status.uuid as string,
        name: statusDisplayLabel(status),
      })),
      { uuid: NONE, name: c.plain("actions.none") },
    ],
    [statuses, c],
  )

  // how many of the selected books sit on each status, with "no status" counted
  // under the synthetic key
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const book of books) {
      const key = book.status ? (book.status.uuid as string) : NONE
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [books])

  return (
    <RelationSelectList
      items={items}
      loading={isLoading}
      enabled
      stateOf={(item) => {
        const n = counts.get(item.uuid) ?? 0
        if (n === 0) return "none"
        return n === books.length ? "primary" : "secondary"
      }}
      onSelect={(item) => {
        void updateReadingStatus({
          status: item.uuid === NONE ? null : (item.uuid as UUID),
          books: bookUuids,
        })
      }}
    />
  )
}
