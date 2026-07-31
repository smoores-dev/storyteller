import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import { STATUS_READ } from "@/database/statusKinds"

export function isBookFinished(book: BookWithRelations): boolean {
  return book.status?.name === STATUS_READ
}

export function getReadingProgress(book: BookWithRelations): number | null {
  if (isBookFinished(book)) return 1
  return book.position?.locator.locations?.totalProgression ?? null
}

export function ProgressDisplayBar({
  progress,
  book: _book,
  className,
}: {
  progress: number
  book: BookWithRelations
  className?: string
}) {
  return (
    <div className={cn("h-1 w-full bg-black/5", className)}>
      <div
        className="bg-cover-accent h-full transition-all"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  )
}
