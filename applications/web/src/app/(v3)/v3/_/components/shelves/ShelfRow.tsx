"use client"

import { useRouter } from "next/navigation"
import { type ReactNode, useCallback, useRef } from "react"

import { Button } from "@v3/_/components/ui/button"
import { V3Link } from "@v3/_/components/v3-link"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { BookCard } from "@/app/(v3)/v3/_/components/books/Grid/BookCard"
import { BookCardSkeleton } from "@/app/(v3)/v3/_/components/books/Grid/BookCardSkeleton"
import { useUserPreferences } from "@/app/(v3)/v3/_/components/user-preferences-provider"
import { useBookInSidePanel } from "@/app/(v3)/v3/_/hooks/use-open-book"
import { type BookWithRelations } from "@/database/books"
import { type HomeSectionWithDetails } from "@/database/shelves"
import { STATUS_READING } from "@/database/statusKinds"
import * as icon from "@/icons"
import { type DisplayField } from "@/sort"
import {
  useListInfiniteBooksInfiniteQuery,
  useListNextUpBooksQuery,
  useListShelfBooksQuery,
  useListStatusesQuery,
} from "@/store/api"

type ShelfRowProps = {
  shelf: HomeSectionWithDetails
  className?: string | undefined
  actions?: ReactNode
}

export function ShelfRow({ shelf, className, actions }: ShelfRowProps) {
  const t = useTranslation("HomePage")
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const { books, isLoading, seeAllHref, displayField } = useShelfBooks(shelf)

  const { bookOpenTarget } = useUserPreferences()
  const { selectedBookUuid, setSelectedBookUuid } = useBookInSidePanel()

  const router = useRouter()

  const handleBookClick = useCallback(
    (book: BookWithRelations) => {
      if (bookOpenTarget === "page") {
        router.push(`/books/${book.uuid}`)
        return
      }

      if (selectedBookUuid === book.uuid) {
        void setSelectedBookUuid(null)
      } else {
        void setSelectedBookUuid(book.uuid)
      }
    },
    [selectedBookUuid, setSelectedBookUuid, router, bookOpenTarget],
  )

  const scrollLeft = () => {
    if (!scrollContainerRef.current) return
    scrollContainerRef.current.scrollBy({ left: -400, behavior: "smooth" })
  }

  const scrollRight = () => {
    if (!scrollContainerRef.current) return
    scrollContainerRef.current.scrollBy({ left: 400, behavior: "smooth" })
  }

  const displayName = shelf.name ?? t(`kinds.${shelf.kind}.name`)

  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-2 px-2", className)}>
        <div className="flex items-center justify-between px-4">
          <h2 className="font-heading text-lg font-medium">{displayName}</h2>
        </div>

        <div className="flex gap-4 overflow-hidden px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-[150px] shrink-0">
              <BookCardSkeleton />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (books.length === 0) {
    return null
  }

  return (
    <div className={cn("group/shelf flex flex-col gap-2 px-2", className)}>
      <div className="flex items-center justify-between px-4">
        <div className="flex items-baseline gap-3">
          <h2 className={cn("font-heading text-lg font-medium")}>
            {displayName}
          </h2>

          <V3Link
            href={seeAllHref}
            className="text-muted-foreground hover:text-foreground text-sm opacity-100 transition-colors transition-opacity md:opacity-0 md:group-hover/shelf:opacity-100"
          >
            {t("shelf.seeAll")}
          </V3Link>
        </div>

        <div className="-mr-2 flex gap-1 transition-opacity md:opacity-0 md:group-hover/shelf:opacity-100">
          <Button
            aria-label={t("actions.scrollLeft")}
            variant="ghost"
            size="icon-sm"
            onClick={scrollLeft}
          >
            <icon.ChevronLeft className="size-4" />
          </Button>

          <Button
            aria-label={t("actions.scrollRight")}
            variant="ghost"
            size="icon-sm"
            onClick={scrollRight}
          >
            <icon.ChevronRight className="size-4" />
          </Button>

          {actions}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="scroll-x flex snap-x scroll-pl-4 gap-4 px-4 pb-2"
      >
        {books.map((book) => (
          <div
            key={book.uuid}
            className="w-[150px] shrink-0 snap-mandatory snap-start"
          >
            <BookCard
              book={book}
              displayFields={[displayField ?? "authors", "title"]}
              onClick={handleBookClick}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

type UseShelfBooksResult = {
  books: BookWithRelations[]
  isLoading: boolean
  seeAllHref: string
  displayField?: DisplayField
}

const SHELF_LIMIT = 20

function useShelfBooks(shelf: HomeSectionWithDetails): UseShelfBooksResult {
  const isCustomShelf = shelf.kind === "custom" && shelf.shelfUuid !== null

  const { data: shelfBooks = [], isLoading: isLoadingShelfBooks } =
    useListShelfBooksQuery(
      {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        shelfUuid: shelf.shelfUuid!,
        limit: SHELF_LIMIT,
      },
      { skip: !isCustomShelf },
    )

  const { data: recentlyAdded, isLoading: isLoadingRecentlyAdded } =
    useListInfiniteBooksInfiniteQuery(
      { limit: SHELF_LIMIT, orderBy: "createdAt", orderDirection: "desc" },
      { skip: shelf.kind !== "recentlyAdded" },
    )

  const { data: statuses } = useListStatusesQuery(undefined, {
    skip: shelf.kind !== "currentlyReading",
  })
  const readingStatus = statuses?.find((s) => s.name === STATUS_READING)

  const { data: currentlyReading, isLoading: isLoadingCurrentlyReading } =
    useListInfiniteBooksInfiniteQuery(
      {
        limit: SHELF_LIMIT,
        orderBy: "lastRead",
        orderDirection: "desc",
        filter: {
          type: "condition",
          field: "status",
          operator: "is",
          value: readingStatus?.uuid ?? null,
        },
      },
      { skip: shelf.kind !== "currentlyReading" || !readingStatus },
    )

  const { data: nextUpBooks = [], isLoading: isLoadingNextUp } =
    useListNextUpBooksQuery(undefined, {
      skip: shelf.kind !== "nextUpInSeries",
    })

  if (isCustomShelf) {
    return {
      books: shelfBooks,
      isLoading: isLoadingShelfBooks,
      seeAllHref: `/shelves/${shelf.shelfUuid}`,
    }
  }

  if (shelf.kind === "recentlyAdded") {
    return {
      books: recentlyAdded?.pages[0] ?? [],
      isLoading: isLoadingRecentlyAdded,
      seeAllHref: "/books?sort=createdAt:desc",
      displayField: "createdAt",
    }
  }

  if (shelf.kind === "currentlyReading") {
    return {
      books: currentlyReading?.pages[0] ?? [],
      isLoading: isLoadingCurrentlyReading || !readingStatus,
      seeAllHref: readingStatus
        ? `/statuses?item=${readingStatus.uuid}`
        : "/books",
    }
  }

  if (shelf.kind === "nextUpInSeries") {
    return {
      books: nextUpBooks,
      isLoading: isLoadingNextUp,
      seeAllHref: "/series",
      displayField: "seriesPosition",
    }
  }

  return {
    books: [],
    isLoading: false,
    seeAllHref: "/books",
  }
}
