import { Carousel } from "@mantine/carousel"
import "@mantine/carousel/styles.css"
import { Checkbox, Stack, Title, px } from "@mantine/core"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [columnCount, setColumnCount] = useState(1)

  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries
      if (!entry) return
      setColumnCount(
        Math.floor(entry.contentRect.width / (px("10.6875rem") as number)),
      )
    })

    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  if (!books.length) return null

  return (
    <Stack ref={containerRef}>
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
        emblaOptions={{
          align: "start",
          slidesToScroll: columnCount,
        }}
        slideSize="w-36.75"
        slideGap="md"
        withIndicators
        classNames={{
          indicators: "bottom-0!",
          indicator: "bg-st-orange-100! data-active:bg-st-orange-600!",
        }}
      >
        {books.map((book) => (
          <Carousel.Slide key={book.uuid}>
            {isSelecting && (
              <Checkbox
                className="absolute top-1 left-1 z-50"
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
