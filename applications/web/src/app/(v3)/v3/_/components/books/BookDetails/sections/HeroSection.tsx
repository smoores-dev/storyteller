"use client"

import { motion, useReducedMotion } from "motion/react"
import { type RefObject, useLayoutEffect, useRef, useState } from "react"

import {
  AuthorEditor,
  NarratorEditor,
} from "@v3/_/components/books/AuthorEditor"
import { useBookForm } from "@v3/_/components/books/BookDetails/BookFormProvider"
import { CoverEditor } from "@v3/_/components/books/BookDetails/CoverEditor"
import { useProcessingRun } from "@v3/_/components/books/BookDetails/useProcessingRun"
import {
  ProgressDisplayBar,
  getReadingProgress,
} from "@v3/_/components/books/ProgressDisplayBar"
import { RatingDisplay, RatingInput } from "@v3/_/components/books/RatingInput"
import { ReadingStatusButton } from "@v3/_/components/books/ReadingStatusButton"
import { SeriesEditor } from "@v3/_/components/books/SeriesEditor"
import { Button } from "@v3/_/components/ui/button"
import { V3Link } from "@v3/_/components/v3-link"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { bookDuration, bookPageCount } from "@v3/_/lib/bookMetrics"

import { EditableText } from "@/app/(v3)/v3/_/components/books/BookDetails/EditableText"
import {
  DurationEdit,
  PageCountEdit,
} from "@/app/(v3)/v3/_/components/books/BookDetails/MetricEdit"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { cn } from "@/cn"
import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { usePermissions } from "@/hooks/usePermissions"
import * as icon from "@/icons"
import {
  useDeleteUserBookRatingMutation,
  useSetUserBookRatingMutation,
} from "@/store/api"

const MAX_CREATORS = 5

const XL_BOOK_REM = 36

// mirrors the @xl/book container query in js so the flex-col/flex-row switch
// happens in a react render, where motion can flip-animate it.
function useBookContainerIsWide(ref: RefObject<HTMLDivElement | null>) {
  const [isWide, setIsWide] = useState<boolean | null>(null)

  useLayoutEffect(() => {
    const container = ref.current?.closest("[data-book-container]")
    if (!(container instanceof HTMLElement)) return

    const update = () => {
      const rem =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setIsWide(container.clientWidth >= XL_BOOK_REM * rem)
    }
    update()

    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [ref])

  return isWide
}

export function HeroSection({
  compact,
  className,
}: {
  compact: boolean
  className?: string
}) {
  const {
    book,
    isEditing,
    editingCovers,
    isFieldActive,
    setEditingField,
    canEdit,
  } = useBookForm()
  const t = useTranslation("BookDetailsPage")
  const tAlignment = useTranslation("BookDetailsPage.alignment")
  const c = useCommon()

  const permissions = usePermissions()
  const { start: startProcessing, dialog: processingDialog } = useProcessingRun(
    [book],
  )

  const canCreateReadaloud =
    !!permissions?.bookProcess &&
    !!book.ebook &&
    !!book.audiobook &&
    !book.readaloud
  const [setUserBookRating] = useSetUserBookRatingMutation()
  const [deleteUserBookRating] = useDeleteUserBookRatingMutation()

  const authors = book.authors
  const narrators = book.narrators

  const [authorsExpanded, setAuthorsExpanded] = useState(false)
  const [narratorsExpanded, setNarratorsExpanded] = useState(false)
  const [ratingOverrideActive, setRatingOverrideActive] = useState(false)

  const visibleAuthors = authorsExpanded
    ? authors
    : authors.slice(0, MAX_CREATORS)
  const hiddenAuthorCount = authors.length - MAX_CREATORS

  const visibleNarrators = narratorsExpanded
    ? narrators
    : narrators.slice(0, MAX_CREATORS)
  const hiddenNarratorCount = narrators.length - MAX_CREATORS

  const hasDimensions =
    !!book.userBookRating?.dimensions &&
    Object.keys(book.userBookRating.dimensions).length > 0

  const handleRatingChange = async (rating: number | null) => {
    const review = book.userBookRating?.review ?? null
    const dims = book.userBookRating?.dimensions ?? null
    if (rating == null && !review && !dims) {
      await deleteUserBookRating({ bookUuid: book.uuid })
    } else {
      await setUserBookRating({ bookUuid: book.uuid, rating })
    }
  }

  const ratingColor = "var(--cover-accent)"

  const heroRef = useRef<HTMLDivElement>(null)
  const isWide = useBookContainerIsWide(heroRef)
  const reducedMotion = useReducedMotion()

  const wide = (queryCls: string, wideCls: string) =>
    isWide === null ? queryCls : isWide ? wideCls : null

  const layoutTransition = reducedMotion
    ? ({ duration: 0 } as const)
    : ({ type: "spring", duration: 0.35, bounce: 0 } as const)

  const readingProgress = getReadingProgress(book)

  const alignRow = cn(
    "justify-center",
    wide(`@xl/book:justify-start`, "justify-start"),
  )
  const alignText = cn(
    "w-full text-center",
    wide(`@xl/book:w-auto @xl/book:text-left`, "w-auto text-left"),
  )

  return (
    <div
      className={cn(
        "via-cover-wash to-cover-well dark:to-cover-header relative bg-linear-to-t/oklch from-transparent",
        "via-30% @xl/book:via-40%",
        readingProgress !== null && "pb-4",
      )}
    >
      <div
        ref={heroRef}
        className={cn(
          "group/hero relative flex flex-col items-center gap-5 px-6 pt-14 pb-5 text-center",
          wide(
            `@xl/book:flex-row @xl/book:items-center @xl/book:gap-8 @xl/book:text-left`,
            "flex-row items-center gap-8 text-left",
          ),
          !isEditing && !editingCovers && wide(`@xl/book:min-h-80`, "min-h-80"),
          className,
        )}
      >
        <motion.div
          layout="position"
          layoutDependency={isWide}
          transition={layoutTransition}
          className="shrink-0"
        >
          <CoverEditor compact={compact} />
        </motion.div>

        <motion.div
          layout="position"
          layoutDependency={isWide}
          transition={layoutTransition}
          className={cn(
            "flex h-full w-full grow flex-col items-center gap-5",
            wide(
              `@xl/book:items-start @xl/book:justify-between @xl/book:gap-1.5`,
              "items-start justify-between gap-1.5",
            ),
          )}
        >
          <div
            className={cn(
              "flex w-full flex-col items-center gap-1",
              wide(`@xl/book:items-start`, "items-start"),
            )}
          >
            <EditableText
              name="title"
              as="h1"
              className={cn(
                "text-tinted-subtle font-heading text-lg leading-tight font-semibold text-balance",
                alignText,
              )}
              placeholder={c.plain("fields.label.title")}
            />

            {(book.subtitle || isFieldActive("subtitle")) && (
              <EditableText
                name="subtitle"
                as="p"
                className={cn("text-tinted -mt-1 text-sm", alignText)}
                placeholder={c.plain("fields.label.subtitle")}
              />
            )}

            {isFieldActive("series") ? (
              <div className={cn("w-full", alignText)}>
                <SeriesEditor className={cn("[&_svg]:text-tinted", alignRow)} />
              </div>
            ) : book.series.length > 0 ? (
              <p
                className={cn(
                  "text-tinted group/series relative flex flex-wrap items-center gap-x-3 gap-y-1 text-xs",
                  alignRow,
                )}
              >
                {book.series.map((s, idx) => (
                  <V3Link
                    href={`/series?item=${s.uuid}&book=${book.uuid}`}
                    key={s.uuid}
                    className="hover:text-tinted-strong text-tinted font-medium hover:underline"
                  >
                    {s.name.trim()} {s.position ? `#${s.position}` : ""}
                    {idx < book.series.length - 1 && <span>,</span>}
                  </V3Link>
                ))}

                {canEdit && (
                  <TooltipButton
                    type="button"
                    size="icon-sm"
                    variant="real-ghost"
                    className="hover:text-foreground absolute top-0.5 -right-6 h-4 underline opacity-0 transition-opacity group-hover/series:opacity-100"
                    onClick={() => {
                      setEditingField("series")
                    }}
                    tooltip={c("actions.edit")}
                    aria-label={c("actions.edit")}
                  >
                    <icon.Edit className="size-3.5 stroke-[1.5]" />
                  </TooltipButton>
                )}
              </p>
            ) : null}

            {isEditing || isFieldActive("authors") ? (
              <div className={cn("w-full", alignText)}>
                <AuthorEditor className={cn("[&_svg]:text-tinted", alignRow)} />
              </div>
            ) : (
              authors.length > 0 && (
                <p
                  className={cn(
                    "text-tinted group/authors relative mt-0.5 flex flex-wrap gap-x-1 text-xs",
                    alignRow,
                    canEdit && "cursor-pointer",
                  )}
                >
                  <span>{t("writtenBy")}</span>

                  {visibleAuthors.map((author, idx) => (
                    <V3Link
                      key={author.uuid}
                      className="hover:text-tinted-strong text-tinted font-medium hover:underline"
                      href={`/authors?item=${author.uuid}&book=${book.uuid}`}
                    >
                      {author.name.trim()}
                      {idx < visibleAuthors.length - 1 && <span>,</span>}
                    </V3Link>
                  ))}

                  {!authorsExpanded && hiddenAuthorCount > 0 && (
                    <button
                      type="button"
                      className="hover:text-foreground underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        setAuthorsExpanded(true)
                      }}
                    >
                      {t("more", { count: hiddenAuthorCount })}
                    </button>
                  )}

                  {canEdit && (
                    <TooltipButton
                      type="button"
                      size="icon-sm"
                      variant="real-ghost"
                      className="hover:text-foreground absolute top-0.5 -right-6 h-4 underline opacity-0 transition-opacity group-hover/authors:opacity-100"
                      onClick={() => {
                        setEditingField("authors")
                      }}
                      tooltip={c("actions.edit")}
                      aria-label={c("actions.edit")}
                    >
                      <icon.Edit className="size-3.5 stroke-[1.5]" />
                    </TooltipButton>
                  )}
                </p>
              )
            )}

            {isEditing || isFieldActive("narrators") ? (
              <div className={cn("w-full", alignText)}>
                <NarratorEditor className={alignRow} />
              </div>
            ) : (
              narrators.length > 0 && (
                <p
                  className={cn(
                    "text-tinted group/narrators relative flex flex-wrap gap-x-1 text-xs",
                    alignRow,
                    canEdit && "cursor-pointer",
                  )}
                >
                  <span>{t("narratedBy")}</span>

                  {visibleNarrators.map((narrator, idx) => (
                    <V3Link
                      key={narrator.uuid}
                      className="hover:text-tinted-strong text-tinted hover:underline"
                      href={`/narrators?item=${narrator.uuid}&book=${book.uuid}`}
                    >
                      {narrator.name.trim()}
                      {idx < visibleNarrators.length - 1 && <span>,</span>}
                    </V3Link>
                  ))}

                  {!narratorsExpanded && hiddenNarratorCount > 0 && (
                    <button
                      type="button"
                      className="hover:text-foreground underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        setNarratorsExpanded(true)
                      }}
                    >
                      {t("more", { count: hiddenNarratorCount })}
                    </button>
                  )}
                  {canEdit && (
                    <TooltipButton
                      type="button"
                      size="icon-sm"
                      variant="real-ghost"
                      className="hover:text-foreground absolute top-0.5 -right-6 h-4 underline opacity-0 transition-opacity group-hover/narrators:opacity-100"
                      onClick={() => {
                        setEditingField("narrators")
                      }}
                      tooltip={c("actions.edit")}
                      aria-label={c("actions.edit")}
                    >
                      <icon.Edit className="size-3.5 stroke-[1.5]" />
                    </TooltipButton>
                  )}
                </p>
              )
            )}

            {(() => {
              const pageCount = bookPageCount(book)
              const duration = bookDuration(book)
              const hasMetrics =
                pageCount != null || duration != null || canEdit

              if (!hasMetrics) return null

              return (
                <p
                  className={cn(
                    "text-tinted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs",
                    alignRow,
                  )}
                >
                  {(book.pageCount || book.ebook || book.readaloud) && (
                    <PageCountEdit />
                  )}
                  {(book.duration || book.audiobook || book.readaloud) && (
                    <DurationEdit />
                  )}
                </p>
              )
            })()}

            <div className="mt-1">
              {hasDimensions && !ratingOverrideActive ? (
                <button
                  type="button"
                  className="cursor-pointer"
                  onClick={() => {
                    setRatingOverrideActive(true)
                  }}
                  title="click to override"
                >
                  <RatingDisplay
                    rating={book.userBookRating?.rating ?? null}
                    color={ratingColor}
                  />
                </button>
              ) : (
                <RatingInput
                  value={book.userBookRating?.rating ?? null}
                  onChange={handleRatingChange}
                  color={ratingColor}
                />
              )}
            </div>
          </div>

          <motion.div
            layout="position"
            layoutDependency={isWide}
            transition={layoutTransition}
            className={cn(
              "flex w-full flex-wrap justify-center gap-2",
              wide(`@xl/book:justify-between`, "justify-between"),
            )}
          >
            <div
              className={cn(
                "flex grow flex-wrap justify-center gap-2",
                wide(`@xl/book:justify-start`, "justify-start"),
              )}
            >
              <ReadingStatusButton book={book} size="sm" />

              <div className="flex flex-wrap justify-center gap-2">
                {canCreateReadaloud && (
                  <Button
                    variant="cover"
                    size="sm"
                    className="rounded-xl"
                    onClick={(event) => {
                      startProcessing(false, { shiftKey: event.shiftKey })
                    }}
                  >
                    <IconReadaloud className="h-4 w-4" />
                    {tAlignment("createReadaloud")}
                  </Button>
                )}

                {book.readaloud?.status === "ALIGNED" && (
                  <Button
                    variant="cover"
                    size="sm"
                    nativeButton={false}
                    className="rounded-xl"
                    render={
                      <V3Link href={`/books/${book.uuid}/read?mode=readaloud`}>
                        <icon.Readaloud className="h-4 w-4" />
                        Read
                      </V3Link>
                    }
                  />
                )}

                {book.readaloud?.status !== "ALIGNED" && book.ebook && (
                  <Button
                    variant="cover"
                    size="sm"
                    nativeButton={false}
                    className="rounded-xl"
                    render={
                      <V3Link href={`/books/${book.uuid}/read?mode=epub`}>
                        <icon.BookAlt className="mr-1 h-4 w-4" />
                        Read
                      </V3Link>
                    }
                  />
                )}

                {book.readaloud?.status !== "ALIGNED" && book.audiobook && (
                  <Button
                    variant="cover"
                    size="sm"
                    nativeButton={false}
                    className="rounded-xl"
                    render={
                      <V3Link href={`/books/${book.uuid}/read?mode=audiobook`}>
                        <icon.Headphones className="mr-1 h-4 w-4" />
                        Listen
                      </V3Link>
                    }
                  />
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
      {readingProgress !== null && (
        <ProgressDisplayBar
          progress={readingProgress}
          book={book}
          className="bg-cover-wash/20 absolute right-0 bottom-0 left-0 rounded-none"
        />
      )}

      {processingDialog}
    </div>
  )
}
