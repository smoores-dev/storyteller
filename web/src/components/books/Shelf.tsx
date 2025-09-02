import { Carousel } from "@mantine/carousel"
import "@mantine/carousel/styles.css"
import { Checkbox, Stack, Title } from "@mantine/core"
import Link from "next/link"

import { type BookWithRelations } from "@/database/books"
import { type UUID } from "@/uuid"

import { BookThumbnail } from "./BookThumbnail"

interface Props {
  label: string
  href?: string
  books: BookWithRelations[]
  isSelecting: boolean
  selected: Set<UUID>
  onSelect: (book: UUID) => void
}

export function Shelf({
  label,
  href,
  books,
  isSelecting,
  selected,
  onSelect,
}: Props) {
  if (!books.length) return null

  return (
    <Stack>
      <Title order={3}>
        {href ? (
          <Link
            className="hover:decoration-st-orange-600 hover:underline"
            href={href}
          >
            {label}
          </Link>
        ) : (
          label
        )}
      </Title>
      <Carousel
        height={303}
        align="start"
        slideSize="w-[9.1875rem]"
        slideGap="md"
        withIndicators
        classNames={{
          indicators: "!bottom-0",
          indicator: "!bg-st-orange-100 data-[active]:!bg-st-orange-600",
        }}
      >
        {books.map((book) => (
          <Carousel.Slide key={book.uuid}>
            {isSelecting && (
              <Checkbox
                className="absolute left-1 top-1 z-50"
                checked={selected.has(book.uuid)}
                onChange={() => {
                  onSelect(book.uuid)
                }}
              />
            )}
            <BookThumbnail
              book={book}
              link={!isSelecting}
              onClick={() => {
                onSelect(book.uuid)
              }}
            />
          </Carousel.Slide>
        ))}
      </Carousel>
    </Stack>
  )
}
