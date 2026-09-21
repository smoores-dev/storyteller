"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { BookListPage } from "@v3/_/components/books/BookListPage"
import { ShelfActionsMenu } from "@v3/_/components/shelves/ShelfActionsMenu"
import { ShelfEditor } from "@v3/_/components/shelves/ShelfEditor"
import { FilterIssuesBanner } from "@v3/_/components/shelves/filter-issues"
import { Button } from "@v3/_/components/ui/button"
import { useVersionBasePath } from "@v3/_/components/version-context"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { type SortDirection, type SortField } from "@/sort"
import { useListUserShelvesQuery } from "@/store/api"
import { extractEmojiIcon } from "@/strings"
import { type UUID } from "@/uuid"

export function ShelfPageClient({ shelfUuid }: { shelfUuid: UUID }) {
  const t = useTranslation("ShelfPage")
  const tIssues = useTranslation("ShelfFilterIssues")
  const router = useRouter()
  const [editorOpen, setEditorOpen] = useState(false)
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

  const filterIssues = shelf?.filterIssues ?? []

  return (
    <BookListPage
      source={{
        kind: "shelf",
        shelfUuid,
        orderBy: shelfOrderBy,
        orderDirection: shelf?.orderDirection ?? null,
      }}
      {...(defaultSort ? { defaultSort } : {})}
      skip={!shelf || filterIssues.length > 0}
      banner={
        filterIssues.length > 0 && shelf ? (
          <>
            <FilterIssuesBanner
              issues={filterIssues}
              className="mx-5 mb-3"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditorOpen(true)
                  }}
                >
                  {tIssues("editShelf")}
                </Button>
              }
            />
            <ShelfEditor
              open={editorOpen}
              onOpenChange={setEditorOpen}
              shelf={shelf}
            />
          </>
        ) : null
      }
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
