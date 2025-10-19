import { Text, Title } from "@mantine/core"
import { IconChevronLeft } from "@tabler/icons-react"
import Link from "next/link"

import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"

import { ResponsiveSettingsControls } from "../ResponsiveSettingsControls"

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
  return (
    <header
      className={cn(
        "bg-reader-bg relative left-0 right-0 top-0 z-[100] flex h-12 items-center justify-between transition-transform duration-300 ease-in-out",
        isVisible ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <Link
        href={`/books/${book.uuid}`}
        className="text-reader-accent hover:bg-reader-surface-hover flex h-full flex-col items-center justify-center px-4"
      >
        {<span className="sr-only">Back to book</span>}
        <IconChevronLeft />
      </Link>

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

export const BookTitle = ({ book }: { book: BookWithRelations }) => {
  return (
    <div className="flex flex-1 flex-col flex-nowrap items-start gap-0.5 truncate md:flex-row md:items-center md:gap-4">
      <Title
        size="sm"
        className="text-reader-text font-heading max-w-48 truncate font-normal"
      >
        <Link href={`/books/${book.uuid}`}>{book.title}</Link>
      </Title>
      {book.subtitle ? (
        <Text size="xs" className="text-reader-text-muted truncate">
          {book.subtitle}
        </Text>
      ) : (
        <Text size="xs" className="text-reader-text-muted truncate">
          by {book.authors.map((author) => author.name).join(", ")}
        </Text>
      )}
    </div>
  )
}
