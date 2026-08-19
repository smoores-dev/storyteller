import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type BookWithRelations } from "@/database/books"

export function hasMissingMedia(book: BookWithRelations): boolean {
  return (
    book.ebook?.missing === true ||
    book.audiobook?.missing === true ||
    book.readaloud?.missing === true
  )
}

type MissingBadgeProps = {
  book: BookWithRelations
  className?: string
  inline?: boolean
}

export function MissingBadge({ book, className, inline }: MissingBadgeProps) {
  const t = useTranslation("BooksPage")

  if (!hasMissingMedia(book)) return null

  if (inline) {
    return (
      <span
        className={cn(
          "inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white",
          className,
        )}
        title={t.plain("displayOptions.missingFiles")}
      >
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className="size-2.5"
          aria-hidden
        >
          <path d="M8 3a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
        </svg>
      </span>
    )
  }

  return (
    <div
      className={cn(
        "flex size-4.5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm",
        className,
      )}
      title={t.plain("displayOptions.missingFiles")}
    >
      <svg
        viewBox="0 0 16 16"
        fill="currentColor"
        className="size-3"
        aria-hidden
      >
        <path d="M8 3a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
      </svg>
    </div>
  )
}
