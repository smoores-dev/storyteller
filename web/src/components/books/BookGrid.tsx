import { Anchor, Checkbox, List, Text } from "@mantine/core"
import cx from "classnames"

import { type BookWithRelations } from "@/database/books"
import {
  type FilterSortOptions,
  createComparisonTitle,
} from "@/hooks/useFilterSortedBooks"
import { type UUID } from "@/uuid"

import { BookThumbnail } from "./BookThumbnail"

interface Props {
  className?: string
  books: BookWithRelations[]
  isSelecting: boolean
  selected: Set<UUID>
  onSelect: (book: UUID) => void
  filterSortOptions: FilterSortOptions
}

export function BookGrid({
  className,
  books,
  isSelecting,
  selected,
  onSelect,
  filterSortOptions,
}: Props) {
  return (
    <>
      <Text className="mt-4 text-sm">{books.length} books</Text>
      <List
        listStyleType="none"
        className={cx(
          "relative z-10 flex flex-row flex-wrap gap-6 sm:pr-9",
          className,
        )}
      >
        {books.map((book, index) => (
          <List.Item
            id={book.uuid}
            style={{ zIndex: books.length - index }}
            key={book.uuid}
            className="relative scroll-mt-36"
            classNames={{ itemWrapper: "block" }}
          >
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
          </List.Item>
        ))}
      </List>
      <ScrollNav options={filterSortOptions} books={books} />
    </>
  )
}

function ScrollNav({
  options,
  books,
}: {
  options: FilterSortOptions
  books: BookWithRelations[]
}) {
  if (options.sort[0] !== "title" && options.sort[0] !== "author") return null

  const letters = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
  ]

  if (options.sort[1] === "desc") {
    letters.reverse()
  }

  return (
    <nav
      className="bg-st-orange-50 fixed right-6 hidden flex-col items-stretch rounded-md py-1 text-center sm:flex"
      style={{ zIndex: books.length + 1 }}
    >
      {letters.map((letter) => {
        const firstBook =
          books.find((book) =>
            createComparisonTitle(
              book.title,
              new Intl.Locale(book.language ?? "en"),
            ).startsWith(letter.toLowerCase()),
          ) ??
          books.findLast((book) =>
            options.sort[1] === "asc"
              ? createComparisonTitle(
                  book.title,
                  new Intl.Locale(book.language ?? "en"),
                ) < letter.toLowerCase()
              : createComparisonTitle(
                  book.title,
                  new Intl.Locale(book.language ?? "en"),
                ) > letter.toLowerCase(),
          )
        return (
          <Anchor
            key={letter}
            href={`#${firstBook?.uuid}`}
            className="hover:bg-st-orange-100 rounded-md px-2 py-1 text-xs hover:no-underline"
          >
            {letter}
          </Anchor>
        )
      })}
    </nav>
  )
}
