"use client"

import { motion } from "motion/react"
import { useState } from "react"

import {
  AuthorEditor,
  NarratorEditor,
} from "@v3/_/components/books/AuthorEditor"
import { useBookForm } from "@v3/_/components/books/BookDetails/BookFormProvider"
import { CoverEditor } from "@v3/_/components/books/BookDetails/CoverEditor"
import {
  ProgressDisplayBar,
  getReadingProgress,
} from "@v3/_/components/books/ProgressDisplayBar"
import { RatingDisplay, RatingInput } from "@v3/_/components/books/RatingInput"
import { ReadingStatusButton } from "@v3/_/components/books/ReadingStatusButton"
import { SeriesEditor } from "@v3/_/components/books/SeriesEditor"
import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
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
import { type StyledIcon } from "@/icons"
import {
  getDownloadUrl,
  useDeleteUserBookRatingMutation,
  useSetUserBookRatingMutation,
} from "@/store/api"

const MAX_CREATORS = 5

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
  const tLabels = useTranslation("Labels")
  const t = useTranslation("BookDetailsPage")
  const c = useCommon()

  const permissions = usePermissions()
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

  return (
    <div
      className={cn(
        "via-cover-wash to-cover-header relative bg-linear-to-t/oklch from-transparent",
        "via-30% pb-4 @xl/book:via-40%",
      )}
    >
      <div
        className={cn(
          "group/hero relative flex flex-col items-center gap-5 px-6 pt-14 pb-5 text-center",
          `@xl/book:flex-row @xl/book:items-center @xl/book:gap-8 @xl/book:text-left`,
          !isEditing && !editingCovers && `@xl/book:h-80`,
          className,
        )}
      >
        <CoverEditor compact={compact} />

        <motion.div
          className={cn(
            "flex h-full w-full grow flex-col items-center gap-5",
            `@xl/book:items-start @xl/book:justify-between @xl/book:gap-1.5`,
          )}
        >
          <div
            className={cn(
              "flex w-full flex-col items-center gap-1",
              `@xl/book:items-start`,
            )}
          >
            <EditableText
              name="title"
              as="h1"
              className={cn(
                "text-tinted-subtle font-heading w-full text-center text-xl leading-tight font-medium tracking-tight text-balance",
                `@xl/book:w-auto @xl/book:text-left`,
              )}
              placeholder={c.plain("fields.label.title")}
            />

            {(book.subtitle || isFieldActive("subtitle")) && (
              <EditableText
                name="subtitle"
                as="p"
                className={cn(
                  // "font-heading italic",
                  "text-tinted -mt-1 text-sm",
                )}
                placeholder={c.plain("fields.label.subtitle")}
              />
            )}

            {isFieldActive("series") ? (
              <div>
                <SeriesEditor className="[&_svg]:text-tinted justify-center" />
              </div>
            ) : book.series.length > 0 ? (
              <p className="text-tinted group/series relative flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
                {book.series.map((s, idx) => (
                  <V3Link
                    href={`/series?item=${s.uuid}&book=${book.uuid}`}
                    key={s.uuid}
                    className="hover:text-tinted-strong text-tinted font-serif font-medium hover:underline"
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
              <AuthorEditor className="[&_svg]:text-tinted justify-center" />
            ) : (
              authors.length > 0 && (
                <p
                  className={cn(
                    "text-tinted group/authors relative mt-0.5 flex flex-wrap justify-center gap-x-1 text-xs",
                    `@xl/book:justify-start`,
                    canEdit && "cursor-pointer",
                  )}
                >
                  <span className="font-serif">{t("writtenBy")}</span>

                  {visibleAuthors.map((author, idx) => (
                    <V3Link
                      key={author.uuid}
                      className="hover:text-tinted-strong text-tinted font-serif font-medium hover:underline"
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
                      +{hiddenAuthorCount} more
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
              <NarratorEditor className="justify-center" />
            ) : (
              narrators.length > 0 && (
                <p
                  className={cn(
                    "text-tinted group/narrators relative flex flex-wrap justify-center gap-x-1 text-xs",
                    `@xl/book:justify-start`,
                    canEdit && "cursor-pointer",
                  )}
                >
                  <span
                    className={
                      cn()
                      // "font-heading",
                      // "italic"
                    }
                  >
                    {t("narratedBy")}
                  </span>

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
                      +{hiddenNarratorCount} more
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
                    "text-tinted flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs",
                    `@xl/book:justify-start`,
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

          <div
            className={cn(
              "flex flex-wrap justify-center gap-2",
              `w-full @xl/book:justify-between`,
            )}
          >
            <div className="flex grow flex-wrap justify-center gap-2 @xl/book:justify-start">
              <ReadingStatusButton book={book} size="sm" />

              <div className="flex flex-wrap justify-center gap-2">
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

            <div className="flex flex-wrap justify-center gap-2 self-end">
              {permissions?.bookDownload &&
                (book.ebook || book.audiobook || book.readaloud?.filepath) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <TooltipButton
                          variant="cover-outline"
                          size="icon-sm"
                          aria-label={t("downloads.download")}
                          tooltip={t("downloads.download")}
                        >
                          <icon.Download className="size-3.5 stroke-[1.5]" />
                        </TooltipButton>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-fit">
                      {book.readaloud?.filepath && (
                        <DropdownMenuItem
                          render={
                            <a
                              href={getDownloadUrl(book.uuid, "readaloud")}
                              download
                            >
                              <IconReadaloud className="text-st-orange-500 mr-2 h-4 w-4" />
                              {t("downloads.downloadReadaloud")}
                            </a>
                          }
                        />
                      )}

                      {book.ebook && (
                        <DropdownMenuItem
                          render={
                            <a
                              href={getDownloadUrl(book.uuid, "ebook")}
                              download
                            >
                              <icon.BookAlt className="mr-2 h-4 w-4" />
                              {t("downloads.downloadEbook")}
                            </a>
                          }
                        />
                      )}

                      {book.audiobook && (
                        <DropdownMenuItem
                          disabled={book.audiobook.missing}
                          render={
                            <a
                              href={getDownloadUrl(book.uuid, "audiobook")}
                              download
                            >
                              <icon.Headphones className="mr-2 h-4 w-4" />
                              {t("downloads.downloadAudiobook")}
                              {book.audiobook.missing && (
                                <span className="text-bad">
                                  {tLabels("missing")}
                                </span>
                              )}
                            </a>
                          }
                        />
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

              {canEdit && !isEditing && (
                <QuickAddEmptyFields
                  showSubtitle={!book.subtitle && !isFieldActive("subtitle")}
                  showNarrators={
                    narrators.length === 0 && !isFieldActive("narrators")
                  }
                  showSeries={
                    book.series.length === 0 && !isFieldActive("series")
                  }
                  onAddSubtitle={() => {
                    setEditingField("subtitle")
                  }}
                  onAddNarrators={() => {
                    setEditingField("narrators")
                  }}
                  onAddSeries={() => {
                    setEditingField("series")
                  }}
                />
              )}
            </div>
          </div>
        </motion.div>
      </div>
      {getReadingProgress(book) !== null && (
        <ProgressDisplayBar
          progress={getReadingProgress(book) ?? 0}
          book={book}
          className="bg-cover-wash/20 absolute right-0 bottom-0 left-0 rounded-none"
        />
      )}
    </div>
  )
}

function QuickAddEmptyFields({
  showSubtitle,
  showNarrators,
  showSeries,
  onAddSubtitle,
  onAddNarrators,
  onAddSeries,
}: {
  showSubtitle: boolean
  showNarrators: boolean
  showSeries: boolean
  onAddSubtitle: () => void
  onAddNarrators: () => void
  onAddSeries: () => void
}) {
  const tLabels = useTranslation("Labels")
  const tFields = useTranslation("Common.fields.label")
  const c = useCommon()

  const chips: {
    key: string
    label: string
    onClick: () => void
    icon: StyledIcon
  }[] = []
  if (showSubtitle)
    chips.push({
      key: "subtitle",
      icon: icon.H2,
      label: c("fields.label.subtitle"),
      onClick: onAddSubtitle,
    })
  if (showNarrators)
    chips.push({
      key: "narrators",
      icon: icon.Microphone,
      label: tLabels("narrators"),
      onClick: onAddNarrators,
    })
  if (showSeries)
    chips.push({
      key: "series",
      icon: icon.List,
      label: tFields("series"),
      onClick: onAddSeries,
    })
  if (chips.length === 0) return null

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <TooltipButton
            variant="cover"
            className={cn("rounded-full")}
            tooltip={c("actions.add")}
            aria-label={c("actions.add")}
          >
            <icon.Add className="size-3.5 stroke-[1.5]" />
          </TooltipButton>
        }
      />
      <DropdownMenuContent align="end" className="w-fit">
        {chips.map((chip) => (
          <DropdownMenuItem key={chip.key} onClick={chip.onClick}>
            <chip.icon className="size-3.5 stroke-[1.5]" />
            <span className="grow">{chip.label}</span>
            <icon.Add className="size-3" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
