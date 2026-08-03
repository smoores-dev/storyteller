"use client"

import { useMemo } from "react"
import { toast } from "sonner"

import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"

import { RelationSelectList } from "@/app/(v3)/v3/_/components/books/relation-picker/RelationSelectList"
import { type ShelfWithBooks } from "@/database/shelves"
import {
  useListUserShelvesQuery,
  useUpdateUserShelfMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

export function useStaticShelves() {
  const { data: shelves = [], isLoading } = useListUserShelvesQuery()

  const staticShelves = useMemo(
    () =>
      (shelves as unknown as ShelfWithBooks[]).filter(
        (shelf) => shelf.filter === null,
      ),
    [shelves],
  )

  return { staticShelves, isLoading }
}

export function AddToShelfList({
  bookUuids,
  onCreate,
}: {
  bookUuids: UUID[]
  onCreate: (name: string) => void
}) {
  const t = useTranslation("BookActions")
  const c = useCommon()
  const { staticShelves, isLoading } = useStaticShelves()
  const [updateShelf] = useUpdateUserShelfMutation()

  const items = useMemo(
    () =>
      staticShelves.map((shelf) => ({
        uuid: shelf.uuid as string,
        name: shelf.name,
        icon: shelf.icon,
        color: shelf.color,
      })),
    [staticShelves],
  )

  const memberships = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const shelf of staticShelves) {
      map.set(
        shelf.uuid as string,
        new Set(shelf.books.map((book) => book.bookUuid)),
      )
    }
    return map
  }, [staticShelves])

  const handleSelect = async (uuid: string, name: string) => {
    const existing = memberships.get(uuid) ?? new Set<string>()
    const merged = [...existing, ...bookUuids.filter((b) => !existing.has(b))]

    try {
      await updateShelf({ uuid, books: merged }).unwrap()
      toast.success(t.plain("addedToShelf", { count: bookUuids.length, name }))
    } catch (error) {
      toast.error(t.plain("addToShelfFailed"), {
        description: (error as Error).message,
      })
    }
  }

  return (
    <RelationSelectList
      items={items}
      loading={isLoading}
      enabled
      emptyText={c.plain("empty.noItemsFound")}
      stateOf={(item) =>
        bookUuids.every((uuid) => memberships.get(item.uuid)?.has(uuid))
          ? "primary"
          : bookUuids.some((uuid) => memberships.get(item.uuid)?.has(uuid))
            ? "secondary"
            : "none"
      }
      onSelect={(item) => {
        void handleSelect(item.uuid, item.name)
      }}
      create={{
        label: () => t.plain("newShelf"),
        onCreate,
      }}
    />
  )
}
