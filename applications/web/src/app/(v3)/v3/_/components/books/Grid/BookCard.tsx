import { Popover } from "@base-ui/react/popover"
import { useFormatter, useLocale } from "next-intl"
import { Fragment, memo, useCallback, useMemo } from "react"

import { useIsMobile } from "@v3/_/hooks/use-mobile"
import { useCommon } from "@v3/_/hooks/use-translation"
import { useFormatDuration } from "@v3/_/lib/formatters"
import { cn } from "@v3/_/lib/utils"

import { Cover, isDual } from "@/app/(v3)/v3/_/components/books/Cover"
import { useCoverScope } from "@/app/(v3)/v3/_/components/books/CoverScope"
import {
  MissingBadge,
  hasMissingMedia,
} from "@/app/(v3)/v3/_/components/books/MissingBadge"
import { ProcessingIndicator } from "@/app/(v3)/v3/_/components/books/ProcessingIndicator"
import {
  ProgressDisplayBar,
  getReadingProgress,
} from "@/app/(v3)/v3/_/components/books/ProgressDisplayBar"
import { SelectionCheckbox } from "@/app/(v3)/v3/_/components/books/SelectionCheckbox"
import { GradePill } from "@/app/(v3)/v3/_/components/books/grade-pill"
import { bookItemDomId } from "@/app/(v3)/v3/_/components/books/keyboard-nav"
import { useUserPreferences } from "@/app/(v3)/v3/_/components/user-preferences-provider"
import { V3Link } from "@/app/(v3)/v3/_/components/v3-link"
import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { type BookWithRelations } from "@/database/books"
import { getFieldDef } from "@/fields"
import * as icon from "@/icons"
import {
  type CreatorDisplayField,
  type DisplayField,
  type SortContext,
  groupDisplayRows,
} from "@/sort"
import { useAppSelector } from "@/store/appState"
import {
  selectShowMissingBadge,
  selectShowProcessingBadge,
  selectShowReadaloudBadge,
} from "@/store/slices/uiSettingsSlice"
import { type UUID } from "@/uuid"

import { TITLE_HEIGHT } from "./BookGrid"

type BookCardProps = {
  book: BookWithRelations
  index?: number
  coverWidth?: number
  muted?: boolean
  selected?: boolean
  keyboardNav?: boolean
  active?: boolean
  isSelecting?: boolean
  isBookSelected?: boolean
  onToggleSelection?: (uuid: UUID) => void
  onSelectRange?: (uuid: UUID, orderedUuids?: UUID[]) => void
  onOpenMenu?: (book: BookWithRelations, anchor: HTMLElement) => void
  onClick?: (
    book: BookWithRelations,
    isSelecting: boolean,
    isBookSelected: boolean,
  ) => void
  displayFields?: DisplayField[]
  displayContext?: SortContext
  handle?: Popover.Handle<unknown>
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let size = bytes / 1024
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(1)} ${units[i]}`
}

export function SecondaryText({
  book,
  field,
  ctx,
  compact = false,
}: {
  book: BookWithRelations
  field: DisplayField
  ctx: SortContext | undefined
  compact?: boolean
}): React.ReactNode {
  const { dateTime, relativeTime } = useFormatter()
  const { ratingIcon } = useUserPreferences()
  const locale = useLocale()
  const formatDuration = useFormatDuration()
  const c = useCommon()

  const none = <span className="text-muted-foreground">{"\u2014"}</span>

  switch (field) {
    case "userRating":
      return book.userBookRating?.rating != null ? (
        <span>
          {ratingIcon === "star" ? "★" : "♥"}{" "}
          {book.userBookRating.rating.toFixed(2)}
        </span>
      ) : (
        none
      )
    case "seriesPosition": {
      let series = book.series[0]
      for (const s of book.series) {
        if (s.featured) {
          series = s
          break
        }
        if (s.uuid === ctx?.seriesUuid) {
          series = s
          break
        }
      }

      if (!series || series.position == null) return none

      return (
        // TODO: localize
        <span>
          #{series.position} in {series.name}
        </span>
      )
    }
    case "publicationDate":
      return book.publicationDate ? (
        <span>{book.publicationDate.slice(0, 4)}</span>
      ) : (
        none
      )
    case "createdAt":
      return (
        <span>
          {dateTime(new Date(book.createdAt), { dateStyle: "medium" })}
        </span>
      )
    case "updatedAt":
      return (
        <span>
          {relativeTime(new Date(book.updatedAt), {
            now: new Date(),
            style: "narrow",
          })}
        </span>
      )
    case "alignedAt":
      return book.alignedAt ? (
        <span>
          {dateTime(new Date(book.alignedAt), { dateStyle: "medium" })}
        </span>
      ) : (
        none
      )
    case "lastRead":
      return book.position?.updatedAt ? (
        <span>
          {relativeTime(new Date(book.position.updatedAt), {
            now: new Date(),
            style: "narrow",
          })}
        </span>
      ) : (
        none
      )
    case "pageCount": {
      const p = book.ebook?.pageCount ?? book.pageCount
      if (p == null) return none
      return (
        <span>
          {compact
            ? c("units.pagesShort", { count: p })
            : c("units.pages", { count: p })}
        </span>
      )
    }
    case "duration": {
      const d = book.audiobook?.duration ?? book.duration
      return d != null ? (
        <span>
          {formatDuration(d, compact ? { compact: true } : undefined)}
        </span>
      ) : (
        none
      )
    }
    case "fileSize": {
      const f = book.ebook?.fileSize ?? book.audiobook?.fileSize ?? null
      return f != null ? <span>{formatFileSize(f)}</span> : none
    }
    case "language":
      return book.language
        ? new Intl.DisplayNames([locale], {
            type: "language",
            languageDisplay: "dialect",
          }).of(book.language)
        : none
    case "title":
    case "authors":
    case "narrators":
    case "translators":
    case "creators":
      return null
    case "alignmentConfidence":
      return book.alignmentSummary?.confidence != null ? (
        <span>{Math.round(book.alignmentSummary.confidence)}%</span>
      ) : (
        none
      )
    case "alignmentGrade":
      return book.alignmentSummary?.grade ? (
        <GradePill grade={book.alignmentSummary.grade} />
      ) : (
        none
      )
    case "alignmentPreviousGrade":
      return book.alignmentSummary?.previousGrade ? (
        <GradePill
          grade={book.alignmentSummary.previousGrade}
          className="opacity-60"
        />
      ) : (
        none
      )
    case "alignmentSentenceCoverage":
      return book.alignmentSummary?.sentenceCoverage != null ? (
        <span>{Math.round(book.alignmentSummary.sentenceCoverage)}%</span>
      ) : (
        none
      )
    case "alignmentAudioCoverage":
      return book.alignmentSummary?.audioCoverage != null ? (
        <span>{Math.round(book.alignmentSummary.audioCoverage)}%</span>
      ) : (
        none
      )
    default: {
      const _exhaustive: never = field
      return null
    }
  }
}

const MAX_CARD_CREATORS = 5

function creatorsFor(
  book: BookWithRelations,
  field: CreatorDisplayField,
): { uuid: string; name: string; role?: string | null }[] {
  switch (field) {
    case "authors":
      return book.authors
    case "narrators":
      return book.narrators
    case "translators":
      return book.creators.filter((c) => c.role === "trl")
    case "creators":
      return book.creators.filter((c) => c.role !== "trl")
  }
}

const CREATOR_LINK_BASE: Record<CreatorDisplayField, string | null> = {
  authors: "/authors",
  narrators: "/narrators",
  translators: "/translators",
  creators: null,
}

export function CreatorsLine({
  book,
  field,
}: {
  book: BookWithRelations
  field: CreatorDisplayField
}) {
  const people = creatorsFor(book, field)
  if (people.length === 0) return null

  const visible = people.slice(0, MAX_CARD_CREATORS)
  const hiddenCount = people.length - visible.length
  const linkBase = CREATOR_LINK_BASE[field]

  return (
    <p className="text-muted-foreground line-clamp-1 text-xs">
      {visible.map((person, index) => (
        <Fragment key={person.uuid}>
          {linkBase ? (
            <V3Link
              className="hover:text-tinted-strong relative z-20 hover:underline"
              prefetch={false}
              href={`${linkBase}?item=${person.uuid}`}
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              {person.name}
            </V3Link>
          ) : (
            person.name
          )}
          {/* the mixed-role row disambiguates each person by their marc code */}
          {field === "creators" && person.role && (
            <span className="text-muted-foreground/60"> ({person.role})</span>
          )}
          {index < visible.length - 1 && ", "}
        </Fragment>
      ))}
      {hiddenCount > 0 && ` +${hiddenCount}`}
      {field === "translators" && (
        <span className="text-muted-foreground/60"> (trl)</span>
      )}
    </p>
  )
}

function isCreatorField(field: DisplayField): field is CreatorDisplayField {
  if (field === "seriesPosition") {
    return false
  }
  const fieldDef = getFieldDef(field)
  return fieldDef.group === "creators"
}

export const BookCard = memo(function BookCard({
  book,
  index,
  coverWidth = 180,
  muted = false,
  selected = false,
  keyboardNav = false,
  active = false,
  isSelecting = false,
  isBookSelected = false,
  onToggleSelection,
  onSelectRange,
  onOpenMenu,
  onClick,
  displayFields = ["authors", "title"],
  displayContext,
  handle,
}: BookCardProps) {
  const isMobile = useIsMobile()

  const showReadaloudBadge = useAppSelector(selectShowReadaloudBadge)
  const showProcessingBadge = useAppSelector(selectShowProcessingBadge)
  const showMissingBadge = useAppSelector(selectShowMissingBadge)

  const hasReadaloud = book.readaloud !== null
  const isSynced =
    hasReadaloud && book.readaloud?.status === "ALIGNED" && showReadaloudBadge
  const isProcessing =
    book.readaloud?.status === "PROCESSING" && showProcessingBadge

  const isQueued = book.readaloud?.status === "QUEUED" && showProcessingBadge

  const isMissing = showMissingBadge && hasMissingMedia(book)
  const { gridCoverDisplay } = useUserPreferences()
  const fillCover = gridCoverDisplay !== "auto"
  const hasDualFormat = isDual(book)

  const displayRows = useMemo(
    () => groupDisplayRows(displayFields),
    [displayFields],
  )
  const progress = getReadingProgress(book)

  const scope = useCoverScope(book)

  const cardContent = (
    <>
      <div className="relative flex aspect-13/16 shrink-0 flex-col items-center justify-center transition-shadow">
        <div
          className={cn(
            "from-cover-well to-cover-wash dark:to-cover-header",
            "rounded-card absolute inset-0 flex flex-col-reverse overflow-hidden bg-linear-to-t",
          )}
        >
          {progress !== null && progress > 0 && (
            <ProgressDisplayBar
              progress={progress}
              book={book}
              className="relative z-10"
            />
          )}

          {(isProcessing || isQueued) && (
            <ProcessingIndicator
              book={book}
              size={22}
              className="absolute right-1.5 bottom-1.5 z-10"
            />
          )}
        </div>

        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            fillCover
              ? "rounded-card overflow-hidden"
              : cn("p-2", hasDualFormat ? "overflow-visible" : "rounded-card"),
          )}
        >
          <Cover
            book={book}
            width={coverWidth}
            interactive={!isSelecting}
            displayMode={gridCoverDisplay}
            fill={fillCover}
            className={fillCover ? "rounded-card" : undefined}
          />
        </div>

        {onToggleSelection && (
          <SelectionCheckbox
            uuid={book.uuid}
            checked={isBookSelected}
            isSelecting={isSelecting}
            onToggle={onToggleSelection}
            onSelectRange={onSelectRange}
            className={cn("absolute top-1.5 left-1.5 z-30")}
          />
        )}

        {isSynced && !isMobile && (
          <div className="absolute top-[7%] right-[6%] aspect-square w-[12%]">
            <div className="bg-cover-header flex size-full items-center justify-center rounded-full shadow-md">
              <IconReadaloud className="size-[110%] text-white" />
            </div>
          </div>
        )}

        {!isQueued && !isProcessing && isMissing && (
          <MissingBadge
            book={book}
            className="absolute right-1.5 bottom-1.5 z-20 size-5!"
          />
        )}

        {onOpenMenu && handle && (
          <Popover.Trigger
            handle={handle}
            aria-label="Open menu"
            className={cn(
              "absolute bottom-2 left-1.5 z-20",
              "flex size-4 items-center justify-center rounded-full text-white transition-colors",
              !isMobile &&
                !handle.isOpen &&
                "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
            )}
            onClick={(e) => {
              e.stopPropagation()
              onOpenMenu(book, e.currentTarget)
            }}
          >
            <icon.DotsVertical className="size-3.5" />
          </Popover.Trigger>
        )}
      </div>

      {displayRows.length > 0 && (
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-0.5 px-1">
          {displayRows.map((row) => {
            const [field] = row
            if (!field) return null

            if (field === "title") {
              return (
                <V3Link
                  key="title"
                  href={`/books/${book.uuid}`}
                  prefetch={false}
                  className={cn(!onClick && "big-link")}
                >
                  <h3
                    lang={book.language ?? undefined}
                    className={cn(
                      "group-hover:text-tinted-strong line-clamp-2",
                      "font-heading font-medium",
                      "hyphens-auto",
                      "leading-[1.2]",
                      "[font-variant-ligatures:none]",
                    )}
                    style={{ height: TITLE_HEIGHT }}
                  >
                    {book.title}
                  </h3>
                </V3Link>
              )
            }

            if (isCreatorField(field)) {
              return <CreatorsLine key={field} book={book} field={field} />
            }

            const hasPill =
              row.includes("alignmentGrade") ||
              row.includes("alignmentPreviousGrade")

            return (
              <div
                key={row.join("+")}
                className={cn(
                  "text-muted-foreground text-xs tabular-nums",
                  hasPill
                    ? "flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap"
                    : "line-clamp-1",
                )}
              >
                {row.map((f, i) => (
                  <Fragment key={f}>
                    {i > 0 && (
                      <span className="text-muted-foreground/50">
                        {hasPill ? "·" : " · "}
                      </span>
                    )}
                    <SecondaryText
                      book={book}
                      field={f}
                      ctx={displayContext}
                      compact
                    />
                  </Fragment>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </>
  )

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey && onSelectRange) {
        e.preventDefault()
        onSelectRange(book.uuid)
        return
      }

      onClick?.(book, isSelecting, isBookSelected)
    },
    [book, onClick, onSelectRange, isSelecting, isBookSelected],
  )

  return (
    <div
      data-book-uuid={book.uuid}
      {...(index !== undefined && { "data-index": index })}
      {...(keyboardNav && {
        id: bookItemDomId(book.uuid),
        role: "option",
        "aria-selected": active,
      })}
      className={cn(
        "group relative flex h-full min-h-0 flex-col rounded-lg transition-opacity duration-200",
        muted && "opacity-50",
        selected &&
          !isBookSelected &&
          "ring-cover-header bg-tint-strong/20 [&_h3]:text-tinted-strong ring-offset-background ring-2 ring-offset-2",
        isBookSelected && "ring-cover-header rounded-lg ring-2",
        active && "rounded-lg ring-2 ring-blue-500 ring-offset-2 outline-none",
      )}
      {...scope}
    >
      <div
        key={book.uuid}
        role={keyboardNav ? undefined : "button"}
        onKeyDown={
          !keyboardNav && onClick
            ? (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  onClick(book, isSelecting, isBookSelected)
                }
              }
            : undefined
        }
        tabIndex={keyboardNav ? -1 : 0}
        onClick={onClick ? handleCardClick : undefined}
        className={cn(
          "relative flex min-h-0 flex-1 flex-col",
          !keyboardNav &&
            "focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none",
        )}
      >
        {cardContent}
      </div>
    </div>
  )
})
