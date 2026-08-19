"use client"

import { useRouter } from "next/navigation"

import { BookListPage } from "@v3/_/components/books/BookListPage"
import { ShelfActionsMenu } from "@v3/_/components/shelves/ShelfActionsMenu"
import { useVersionBasePath } from "@v3/_/components/version-context"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type SortDirection, type SortField } from "@/sort"
import { useListUserShelvesQuery } from "@/store/api"
import { extractEmojiIcon } from "@/strings"
import { type UUID } from "@/uuid"

export function ShelfPageClient({ shelfUuid }: { shelfUuid: UUID }) {
  const t = useTranslation("ShelfPage")
  const router = useRouter()
  const basePath = useVersionBasePath()

  const { data: shelves = [] } = useListUserShelvesQuery()

  const shelf = shelves.find((s) => s.uuid === shelfUuid)
  const shelfName = shelf
    ? extractEmojiIcon(shelf.name).label || shelf.name
    : "Shelf"

  const shelfOrderBy = shelf?.orderBy ?? null
  const shelfDirection: SortDirection =
    shelf?.orderDirection === "asc" ? "asc" : "desc"
  const defaultSort =
    shelfOrderBy && shelfOrderBy !== "position"
      ? { field: shelfOrderBy as SortField, direction: shelfDirection }
      : undefined

  return (
    <BookListPage
      source={{
        kind: "shelf",
        shelfUuid,
        orderBy: shelfOrderBy,
        orderDirection: shelf?.orderDirection ?? null,
      }}
      {...(defaultSort ? { defaultSort } : {})}
      breadcrumbs={[
        { label: t("breadcrumb"), url: "/shelves" },
        { label: shelfName },
      ]}
      headerActions={
        <>
          <ShelfActionsMenu
            shelf={shelf}
            allEntitiesPageHref={{
              label: t("goToAllShelves"),
              href: `/shelves?item=${shelfUuid}`,
            }}
            onDeleted={() => {
              router.push(`${basePath}/shelves`)
            }}
          />
        </>
      }
      description={shelf?.description}
      emptyMessage={t.plain("emptyShelf")}
      emptyFilteredSubMessage={t.plain("adjustFilters")}
    />
  )
}
