"use client"

import { type UUID } from "crypto"

import dynamic from "next/dynamic"
import { useCallback, useRef, useState } from "react"

import { SiteHeader } from "@v3/_/components/site-header"
import { useReportPanel } from "@v3/_/hooks/use-report-panel"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { BookDetailsSkeleton } from "@/app/(v3)/v3/_/components/books/BookDetails/BookDetailsSkeleton"
import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import { usePermissions } from "@/hooks/usePermissions"
import { api, useGetBookQuery } from "@/store/api"
import { useAppDispatch } from "@/store/appState"

import { BookEditBar } from "./BookEditBar"
import { BookFormProvider } from "./BookFormProvider"
import { BookPageHeader, BookPanelHeader } from "./BookHeaders"
import { DeleteBookModal } from "./DeleteBookModal"
import { ProcessingSection } from "./ProcessingSection"
import { ContributorsSection } from "./sections/ContributorsSection"
import { useCoverScope } from "../CoverScope"
import { DescriptionSection } from "./sections/DescriptionSection"
import { DetailsSection } from "./sections/DetailsSection"
import { FileSection } from "./sections/FileSection"
import { HeroSection } from "./sections/HeroSection"
import { CollectionsSection, TagsSection } from "./sections/RelationSections"
import { ReviewSection } from "./sections/ReviewSection"

const DynamicAlignmentReport = dynamic(
  () =>
    import(
      "@v3/_/components/books/AlignmentReport/AlignmentReportContent"
    ).then((mod) => mod.AlignmentReportContent),
  { ssr: false },
)

type BookDetailsContentProps = {
  uuid: UUID
  initialBook?: BookWithRelations
  compact?: boolean
  assetsDir?: string
  isEditing?: boolean
  onEditingChange?: (isEditing: boolean) => void
  onClose?: () => void
  nextBook?: () => void
  previousBook?: () => void
}

function useSeedBook(uuid: UUID, book: BookWithRelations | undefined) {
  const dispatch = useAppDispatch()
  const seeded = useRef<string | null>(null)
  if (book && seeded.current !== uuid) {
    seeded.current = uuid
    void dispatch(api.util.upsertQueryData("getBook", { uuid }, book))
  }
}

export function BookDetailsContent({
  uuid,
  initialBook,
  compact,
  assetsDir,
  nextBook,
  previousBook,
  isEditing,
  onEditingChange,
  onClose,
}: BookDetailsContentProps) {
  useSeedBook(uuid, initialBook)

  const { data: queryBook, isLoading: isLoadingBook } = useGetBookQuery({
    uuid,
  })
  const t = useTranslation("BookDetailsPage")

  const book = queryBook ?? initialBook

  if (isLoadingBook && !initialBook) {
    if (compact) {
      return (
        <div className="flex-1">
          <BookDetailsSkeleton compact={compact} />
        </div>
      )
    }

    return <BookDetailsSkeleton />
  }

  if (!book) {
    if (compact) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <h1 className="text-lg font-bold">{t("bookNotFound")}</h1>
        </div>
      )
    }

    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader
          breadcrumbs={[
            { label: "Books", url: "/books" },
            { label: "Not Found" },
          ]}
        />
        <div className="flex-1 flex-col items-center justify-center">
          <h1 className="text-2xl font-bold">{t("bookNotFound")}</h1>
        </div>
      </div>
    )
  }

  return (
    <BookDetailsContentInner
      book={book}
      compact={compact ?? false}
      assetsDir={assetsDir}
      isEditing={isEditing}
      onEditingChange={onEditingChange}
      onClose={onClose}
      nextBook={nextBook}
      previousBook={previousBook}
    />
  )
}

function BookDetailsContentInner({
  book,
  compact,
  assetsDir,
  isEditing: controlledIsEditing,
  onEditingChange,
  onClose,
  nextBook,
  previousBook,
}: {
  book: BookWithRelations
  compact: boolean
  assetsDir: string | undefined
  isEditing: boolean | undefined
  onEditingChange: ((isEditing: boolean) => void) | undefined
  onClose: (() => void) | undefined
  nextBook?: () => void
  previousBook?: () => void
}) {
  const permissions = usePermissions()
  const [localIsEditing, setLocalIsEditing] = useState(false)
  const { reportMode, setReportMode } = useReportPanel()

  // only honor report mode when there is actually a report to show.
  const showReport = reportMode && !!book.alignmentSummary?.grade

  const isControlled = controlledIsEditing !== undefined
  const isEditing = isControlled ? controlledIsEditing : localIsEditing

  const handleEditingChange = useCallback(
    (value: boolean) => {
      if (isControlled) {
        onEditingChange?.(value)
      } else {
        setLocalIsEditing(value)
      }
    },
    [isControlled, onEditingChange],
  )

  const scope = useCoverScope(book)

  return (
    <BookFormProvider
      book={book}
      isEditing={isEditing}
      onEditingChange={handleEditingChange}
    >
      <article
        className={cn("relative h-full w-full", "bg-background")}
        {...scope}
      >
        {!compact && <BookPageHeader />}
        {compact && (
          <BookPanelHeader
            onClose={onClose}
            nextBook={nextBook}
            previousBook={previousBook}
          />
        )}
        <BookEditBar />

        <div className="scroll-y @container-size @container/book h-full flex-1">
          {/* this is some fucked up structure but its necessary in order to get full width background
        for full page view
         */}
          <HeroSection
            compact={compact || false}
            className={cn(!compact && "mx-auto max-w-3xl")}
          />
          <div
            className={cn(
              "flex flex-col gap-4 transition-[height]",
              !compact && "mx-auto max-w-3xl",
            )}
          >
            {showReport ? (
              <DynamicAlignmentReport
                uuid={book.uuid}
                compact
                embedded
                onBack={() => void setReportMode(false)}
              />
            ) : (
              <div className="flex flex-col gap-5 p-6">
                <ReviewSection />

                <DescriptionSection />

                <DetailsSection />

                <div className="flex w-full flex-col gap-4 @xl/book:grid @xl/book:grid-cols-2 @xl/book:gap-10">
                  <TagsSection />
                  <CollectionsSection />
                </div>

                <ContributorsSection />

                {permissions?.bookProcess &&
                  ((book.ebook &&
                    !book.ebook.missing &&
                    book.audiobook &&
                    !book.audiobook.missing) ||
                    book.readaloud ||
                    book.alignedAt) && <ProcessingSection book={book} />}

                <FileSection book={book} assetsDir={assetsDir} />
              </div>
            )}
          </div>
        </div>
      </article>
    </BookFormProvider>
  )
}
