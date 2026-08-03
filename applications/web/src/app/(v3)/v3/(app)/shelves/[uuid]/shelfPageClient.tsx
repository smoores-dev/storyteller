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

  // the shelf's saved ordering is the page's default sort. manual "position"
  // isn't part of the sort vocabulary, so it rides along on the source instead.
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
      beforeFilters={
        shelf?.description ? (
          <p className="text-muted-foreground max-w-md px-4 text-sm">
            {shelf.description}
          </p>
        ) : null
      }
      filtersClassName="pt-1"
      emptyMessage={t.plain("emptyShelf")}
      emptyFilteredSubMessage={t.plain("adjustFilters")}
    />
  )
}
