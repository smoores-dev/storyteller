import { IconChevronLeft } from "@tabler/icons-react"
import { useRouter } from "next/navigation"

import { cn } from "@/cn"
import { ResponsiveSettingsControls } from "@/components/reader/ResponsiveSettingsControls"
import { type BookWithRelations } from "@/database/books"

type Props = {
  book: BookWithRelations
  isVisible: boolean
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

export const ReaderHeader = ({
  book,
  isVisible,
  isFullscreen,
  onToggleFullscreen,
}: Props) => {
  const router = useRouter()
  return (
    <header
      className={cn(
        "bg-reader-bg relative top-0 right-0 left-0 z-100 flex h-12 items-center justify-between transition-transform duration-300 ease-in-out",
        isVisible ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <button
        onClick={() => {
          router.back()
        }}
        className="text-reader-accent hover:bg-reader-surface-hover flex h-full flex-col items-center justify-center px-4"
      >
        {<span className="sr-only">Back to book</span>}
        <IconChevronLeft />
      </button>

      <div className="mr-4 flex items-center gap-1">
        <ResponsiveSettingsControls
          book={book}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          context="reader"
        />
      </div>
    </header>
  )
}
