"use client"

import { useRouter } from "next/navigation"
import { useRef } from "react"

import { BookCard } from "@v3/_/components/books/Grid/BookCard"
import { Button } from "@v3/_/components/ui/button"
import { useBookInSidePanel } from "@v3/_/hooks/use-open-book"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { useBookForm } from "@/app/(v3)/v3/_/components/books/BookDetails/BookFormProvider"
import { useUserPreferences } from "@/app/(v3)/v3/_/components/user-preferences-provider"
import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { type DisplayField } from "@/sort"
import { useListInfiniteBooksInfiniteQuery } from "@/store/api"

import { CollapsibleSection } from "./CollapsibleSection"

const RELATED_LIMIT = 20

function RelatedBooksRow({
  books,
  displayFields,
}: {
  books: BookWithRelations[]
  displayFields: DisplayField[]
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const { bookOpenTarget } = useUserPreferences()
  const { setSelectedBookUuid, selectedBookUuid } = useBookInSidePanel()
  const isInSidePanel = !!selectedBookUuid

  const router = useRouter()

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" })
  }

  const handleClick = (book: BookWithRelations) => {
    if (isInSidePanel && bookOpenTarget === "panel") {
      void setSelectedBookUuid(book.uuid)
      return
    }

    router.push(`/books/${book.uuid}`)
  }

  return (
    <div className="group/related relative">
      <div
        ref={scrollRef}
        className="scroll-x -mx-1 flex snap-x scroll-pl-1 gap-3 px-1 pb-2"
      >
        {books.map((book) => (
          <div
            key={book.uuid}
            className="w-[110px] shrink-0 snap-mandatory snap-start"
          >
            <BookCard
              book={book}
              displayFields={displayFields}
              onClick={handleClick}
              gridCardSize="smallest"
            />
          </div>
        ))}
      </div>

      {books.length > 3 && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center opacity-0 transition-opacity group-hover/related:opacity-100">
          <Button
            aria-label="Scroll left"
            variant="secondary"
            size="icon-sm"
            className="pointer-events-auto mr-1 rounded-full shadow-sm"
            onClick={() => {
              scrollBy(-300)
            }}
          >
            <icon.ChevronLeft className="size-4" />
          </Button>
          <Button
            aria-label="Scroll right"
            variant="secondary"
            size="icon-sm"
            className="pointer-events-auto rounded-full shadow-sm"
            onClick={() => {
              scrollBy(300)
            }}
          >
            <icon.ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

export function MoreByAuthorSection() {
  const { book } = useBookForm()
  const t = useTranslation("BookDetailsPage")

  const author = book.authors[0] ?? null

  const { data } = useListInfiniteBooksInfiniteQuery(
    {
      limit: RELATED_LIMIT,
      orderBy: "publicationDate",
      orderDirection: "desc",
      filter: {
        type: "condition",
        field: "creators",
        operator: "includes",
        value: [author?.uuid ?? ""],
        qualifier: "aut",
      },
    },
    { skip: !author },
  )

  const books = (data?.pages[0] ?? []).filter(
    (other) => other.uuid !== book.uuid,
  )

  if (!author || books.length === 0) return null

  return (
    <CollapsibleSection
      title={t.plain("moreByAuthor", { name: author.name.trim() })}
      sectionKey="moreByAuthor"
    >
      <RelatedBooksRow books={books} displayFields={["title"]} />
    </CollapsibleSection>
  )
}

export function MoreInSeriesSection() {
  const { book } = useBookForm()
  const t = useTranslation("BookDetailsPage")

  const series = book.series[0] ?? null

  const { data } = useListInfiniteBooksInfiniteQuery(
    {
      limit: RELATED_LIMIT,
      orderBy: "seriesPosition",
      orderDirection: "asc",
      series: series?.uuid,
      filter: {
        type: "condition",
        field: "series",
        operator: "includes",
        value: [series?.uuid ?? ""],
      },
    },
    { skip: !series },
  )

  const books = (data?.pages[0] ?? []).filter(
    (other) => other.uuid !== book.uuid,
  )

  if (!series || books.length === 0) return null

  return (
    <CollapsibleSection
      title={t.plain("moreInSeries", { name: series.name.trim() })}
      sectionKey="moreInSeries"
    >
      <RelatedBooksRow
        books={books}
        displayFields={["seriesPosition", "title"]}
      />
    </CollapsibleSection>
  )
}
