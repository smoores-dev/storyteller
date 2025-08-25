"use client"

import { api, useGetShelvesQuery, useListStatusesQuery } from "@/store/api"
import { Stack, Text } from "@mantine/core"
import { Shelf } from "./Shelf"
import { useMemo, useState } from "react"
import { UUID } from "@/uuid"
import { CollectionToolbar } from "../collections/toolbar/CollectionToolbar"
import { Shelves } from "@/apiModels"
import { useInitialData } from "@/hooks/useInitialData"

interface Props {
  shelves: Shelves
}

export function BookShelves({ shelves: initialShelves }: Props) {
  useInitialData(
    api.util.upsertQueryData("getShelves", undefined, initialShelves),
  )

  const { data: shelves } = useGetShelvesQuery()
  const { data: statuses } = useListStatusesQuery()
  const toReadStatus =
    statuses?.find((status) => status.name === "To read") ?? null
  const readingStatus =
    statuses?.find((status) => status.name === "Reading") ?? null

  const [selected, setSelected] = useState(() => new Set<UUID>())
  const [isEditing, setIsEditing] = useState(false)

  const allShelfBooks = useMemo(() => {
    if (!shelves) return []
    return [
      ...shelves.currentlyReading,
      ...shelves.nextUp,
      ...shelves.recentlyAdded,
      ...shelves.startReading,
    ]
  }, [shelves])

  if (!shelves) return null

  return (
    <Stack>
      <CollectionToolbar
        books={allShelfBooks}
        selected={selected}
        setSelected={setSelected}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />
      {!shelves.currentlyReading.length &&
        !shelves.nextUp.length &&
        !shelves.startReading.length &&
        !shelves.recentlyAdded.length && (
          <Text>
            There’s nothing here! Upload a book or configure an automatic import
            folder in the settings to get started.
          </Text>
        )}
      <Shelf
        label="Currently reading"
        href={`/books?statuses=${readingStatus?.uuid}`}
        books={shelves.currentlyReading}
        isSelecting={isEditing}
        selected={selected}
        onSelect={(uuid) => {
          setSelected((prev) => {
            const next = new Set(prev)
            if (selected.has(uuid)) {
              next.delete(uuid)
            } else {
              next.add(uuid)
            }
            return next
          })
        }}
      />
      <Shelf
        label="Next up"
        href="/series"
        books={shelves.nextUp}
        isSelecting={isEditing}
        selected={selected}
        onSelect={(uuid) => {
          setSelected((prev) => {
            const next = new Set(prev)
            if (selected.has(uuid)) {
              next.delete(uuid)
            } else {
              next.add(uuid)
            }
            return next
          })
        }}
      />
      <Shelf
        label="Start reading"
        href={`/books?statuses=${toReadStatus?.uuid}&sort=create-time,desc`}
        books={shelves.startReading}
        isSelecting={isEditing}
        selected={selected}
        onSelect={(uuid) => {
          setSelected((prev) => {
            const next = new Set(prev)
            if (selected.has(uuid)) {
              next.delete(uuid)
            } else {
              next.add(uuid)
            }
            return next
          })
        }}
      />
      <Shelf
        label="Recently added"
        href={`/books?sort=create-time,desc`}
        books={shelves.recentlyAdded}
        isSelecting={isEditing}
        selected={selected}
        onSelect={(uuid) => {
          setSelected((prev) => {
            const next = new Set(prev)
            if (selected.has(uuid)) {
              next.delete(uuid)
            } else {
              next.add(uuid)
            }
            return next
          })
        }}
      />
    </Stack>
  )
}
