import { Popover } from "@base-ui/react/popover"
import { Fragment, memo, useCallback } from "react"

import { useCoverScope } from "@/app/(v3)/v3/_/components/books/CoverScope"
import { Cover } from "@/app/(v3)/v3/_/components/books/Cover"
import {
  CreatorsLine,
  SecondaryText,
} from "@/app/(v3)/v3/_/components/books/Grid/BookCard"
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
import { bookItemDomId } from "@/app/(v3)/v3/_/components/books/keyboard-nav"
import { Skeleton } from "@/app/(v3)/v3/_/components/ui/skeleton"
import { V3Link } from "@/app/(v3)/v3/_/components/v3-link"
import { useIsMobile } from "@/app/(v3)/v3/_/hooks/use-mobile"
import { cn } from "@/cn"
import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { type DisplayField, type SortContext } from "@/sort"
import { useAppSelector } from "@/store/appState"
import {
  selectShowMissingBadge,
  selectShowProcessingBadge,
  selectShowReadaloudBadge,
} from "@/store/slices/uiSettingsSlice"
import { type UUID } from "@/uuid"

function isCreatorField(
  field: DisplayField,
): field is "authors" | "narrators" | "translators" | "creators" {
  return (
    field === "authors" ||
    field === "narrators" ||
    field === "translators" ||
    field === "creators"
  )
}

type BookListItemProps = {
  book: BookWithRelations
  muted?: boolean
  selected?: boolean
  // roving keyboard cursor: container owns the tab stop, this row is the active
  // descendant when `active`.
  keyboardNav?: boolean
  active?: boolean
  isSelecting?: boolean
  isBookSelected?: boolean
  onToggleSelection?: (uuid: UUID) => void
  onSelectRange?: (uuid: UUID) => void
  onOpenMenu?: (book: BookWithRelations, anchor: HTMLElement) => void
  isMenuOpen?: boolean
  onClick?: (
    book: BookWithRelations,
    isSelecting: boolean,
    isBookSelected: boolean,
  ) => void
  // the list layout's selected fields, rendered below the title
  displayFields?: DisplayField[]
  displayContext?: SortContext
  showThumbnail?: boolean
  handle?: Popover.Handle<unknown>
}
export const BookListItem = memo(function BookListItem(
  props: BookListItemProps,
) {
  const {
    book,
    muted = false,
    selected = false,
    keyboardNav = false,
    active = false,
    isSelecting = false,
    isBookSelected = false,
    onToggleSelection,
    onSelectRange,
    onOpenMenu,
    isMenuOpen = false,
    onClick,
    displayFields = ["authors"],
    displayContext,
    showThumbnail = true,
    handle,
  } = props

  const isMobile = useIsMobile()

  const showReadaloudBadge = useAppSelector(selectShowReadaloudBadge)
  const showProcessingBadge = useAppSelector(selectShowProcessingBadge)
  const showMissingBadge = useAppSelector(selectShowMissingBadge)

  const isSynced =
    book.readaloud !== null &&
    book.readaloud.status === "ALIGNED" &&
    showReadaloudBadge
  const isProcessing =
    (book.readaloud?.status === "PROCESSING" ||
      book.readaloud?.status === "QUEUED") &&
    showProcessingBadge
  const isMissing = showMissingBadge && hasMissingMedia(book)

  const progress = getReadingProgress(book)

  const scope = useCoverScope(book)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()

      if (e.shiftKey && onSelectRange) {
        e.preventDefault()
        window.getSelection()?.empty()
        onSelectRange(book.uuid)
        return
      }

      onClick?.(book, isSelecting, isBookSelected)
    },
    [book, onClick, onSelectRange, isSelecting, isBookSelected],
  )

  // the creator rows render as their own (linked) lines; every other selected
  // field shares a single compact line below the title.
  const creatorFields = displayFields.filter(isCreatorField)
  const scalarFields = displayFields.filter(
    (f) => f !== "title" && !isCreatorField(f),
  )

  return (
    <div
      data-book-uuid={book.uuid}
      {...(keyboardNav && {
        id: bookItemDomId(book.uuid),
        "aria-selected": active,
      })}
      className={cn(
        "group hover:bg-tint relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-md pr-3 pl-px transition-colors",
        showThumbnail ? "py-px" : "py-1",
        muted && "opacity-50",
        isBookSelected &&
          !selected &&
          "bg-tint/50 ring-cover-header ring-1 ring-inset",
        selected && "bg-tint/70 ring-cover-header ring-1 ring-inset",
        // keyboard cursor reads as a focus ring even though dom focus stays on
        // the container.
        active && "ring-2 ring-blue-500 outline-none ring-inset",
      )}
      onClick={onClick ? handleClick : undefined}
      role={keyboardNav ? "option" : "button"}
      tabIndex={keyboardNav ? -1 : 0}
      onKeyDown={
        keyboardNav
          ? undefined
          : (e) => {
              if ((e.key === "Enter" || e.key === " ") && onClick) {
                onClick(book, isSelecting, isBookSelected)
              }
            }
      }
      {...scope}
    >
      {/* cover */}
      {showThumbnail && (
        <div className="bg-cover-well relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-md">
          <div className="relative flex h-12 w-10 items-center justify-center">
            <Cover
              book={book}
              width={50}
              interactive={false}
              // onLoadingChange={() => {}}
            />
          </div>

          {isSynced && (
            <div className="bg-cover-accent absolute -right-0.5 -bottom-0.5 z-30 flex size-3.5 shrink-0 items-center justify-center rounded-full">
              <IconReadaloud className="size-2.5 text-white" />
            </div>
          )}

          {isProcessing && (
            <ProcessingIndicator
              book={book}
              size={16}
              className="absolute -right-0.5 -bottom-0.5 z-30"
            />
          )}

          {isMissing && (
            <MissingBadge
              book={book}
              className="absolute -right-0.5 -bottom-0.5 z-30"
            />
          )}

          {progress !== null && progress > 0 && (
            <div className="absolute right-0 bottom-0 left-0">
              <ProgressDisplayBar
                progress={progress}
                className="h-0.5"
                book={book}
              />
            </div>
          )}
        </div>
      )}

      {/* title + selected fields */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <V3Link
            href={`/books/${book.uuid}`}
            prefetch={false}
            className={cn("min-w-0 truncate", !onClick && "big-link")}
            onClick={(e) => {
              if (onClick) e.preventDefault()
            }}
          >
            <span className="group-hover:text-tinted-strong font-seriff truncate font-medium">
              {book.title}
            </span>
          </V3Link>

          {!showThumbnail && isSynced && (
            <IconReadaloud className="text-cover-accent size-3.5 shrink-0" />
          )}

          {!showThumbnail && isProcessing && (
            <ProcessingIndicator book={book} size={16} className="shrink-0" />
          )}

          {!showThumbnail && isMissing && (
            <MissingBadge book={book} inline className="shrink-0" />
          )}
        </div>

        {creatorFields.map((field) => (
          <div
            key={field}
            className={cn(
              "text-muted-foreground truncate text-xs",
              "group-hover:text-tinted",
              (selected || isBookSelected) && "text-tinted",
            )}
          >
            <CreatorsLine book={book} field={field} />
          </div>
        ))}

        {scalarFields.length > 0 && (
          <div
            className={cn(
              "text-muted-foreground flex gap-1 truncate text-xs tabular-nums",
              "group-hover:text-tinted",
              (selected || isBookSelected) && "text-tinted",
            )}
          >
            {scalarFields.map((field, i) => (
              <Fragment key={field}>
                {i > 0 && <span className="text-muted-foreground/50">·</span>}
                <SecondaryText book={book} field={field} ctx={displayContext} />
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* actions: checkbox + ellipsis */}
      <div className="flex shrink-0 items-center gap-1">
        {onToggleSelection && (
          <SelectionCheckbox
            uuid={book.uuid}
            checked={isBookSelected}
            isSelecting={isSelecting}
            onToggle={onToggleSelection}
            onSelectRange={onSelectRange}
            // can still access through ellipsis
            className="hidden @xs/page-content:block"
          />
        )}

        {onOpenMenu && handle && (
          <Popover.Trigger
            handle={handle}
            onClick={(e) => {
              e.stopPropagation()
              onOpenMenu(book, e.currentTarget)
            }}
            className={cn(
              "transition-opacity",
              isMenuOpen && "opacity-100",
              !isMobile &&
                !isMenuOpen &&
                "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
            )}
          >
            <icon.DotsVertical className="size-3.5" />
          </Popover.Trigger>
        )}
      </div>
    </div>
  )
})

export function BookListItemSkeleton({
  showThumbnail = true,
}: {
  showThumbnail?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md py-px pr-3 pl-px",
        showThumbnail ? "h-14" : "h-10",
      )}
    >
      {showThumbnail && <Skeleton className="h-14 w-14 rounded-md" />}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}
