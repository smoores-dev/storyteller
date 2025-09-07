import { Anchor, Box, Checkbox, Group, Stack, px } from "@mantine/core"
import cx from "classnames"
import {
  type Dispatch,
  type Ref,
  type RefObject,
  type SetStateAction,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  List,
  type ListImperativeAPI,
  type RowComponentProps,
} from "react-window"

import { FilterSort } from "@/components/collections/FilterSort"
import { CollectionToolbar } from "@/components/collections/toolbar/CollectionToolbar"
import { type BookWithRelations } from "@/database/books"
import { type Collection } from "@/database/collections"
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
  filterSortOptions: FilterSortOptions
  collection: Collection | undefined
  setSelected: Dispatch<SetStateAction<Set<UUID>>>
  isEditing: boolean
  setIsEditing: Dispatch<SetStateAction<boolean>>
  showCollectionToolbar?: boolean
}

export function BookGrid({
  className,
  books,
  isSelecting,
  selected,
  filterSortOptions,
  collection,
  setSelected,
  isEditing,
  setIsEditing,
  showCollectionToolbar = false,
}: Props) {
  const [columnCount, setColumnCount] = useState(1)
  const [filtersSize, setFiltersSize] = useState(0)
  const filterSortRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<ListImperativeAPI | null>(null)
  const rowCount = useMemo(
    () => Math.ceil(books.length / columnCount),
    [books.length, columnCount],
  )

  useLayoutEffect(() => {
    if (!filterSortRef.current) return
    const { height } = filterSortRef.current.getBoundingClientRect()
    setFiltersSize(height + (px("1rem") as number))
  }, [filterSortOptions.filters])

  const onSelect = useCallback(
    (bookUuid: UUID) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (prev.has(bookUuid)) {
          next.delete(bookUuid)
        } else {
          next.add(bookUuid)
        }
        return next
      })
    },
    [setSelected],
  )

  return (
    <>
      <List
        listRef={listRef}
        rowComponent={BookGridItem}
        rowProps={{
          books,
          isSelecting,
          selected,
          onSelect,
          columnCount,
          filtersSize,
          filterSortOptions,
          filterSortRef,
          showCollectionToolbar,
        }}
        rowCount={rowCount + 1}
        rowHeight={rowHeight}
        onResize={({ width }) => {
          setColumnCount(Math.floor(width / (px("10.6875rem") as number)))
          const filterSort = document.getElementById("filter-sort")
          if (!filterSort) return
          const { height } = filterSort.getBoundingClientRect()
          setFiltersSize(height + (px("1rem") as number))
        }}
        className={cx("relative z-10 sm:pr-9", className)}
      >
        {showCollectionToolbar && (
          <div className="sticky top-0 h-0" style={{ marginTop: filtersSize }}>
            <Stack className="z-20 w-full gap-x-0 gap-y-1 overflow-x-scroll bg-white pb-2 pt-1">
              <CollectionToolbar
                collection={collection}
                books={books}
                selected={selected}
                setSelected={setSelected}
                isEditing={isEditing}
                setIsEditing={setIsEditing}
              />
            </Stack>
          </div>
        )}
      </List>
      <ScrollNav
        listRef={listRef}
        options={filterSortOptions}
        books={books}
        columnCount={columnCount}
      />
    </>
  )
}

function rowHeight(
  index: number,
  { filtersSize, showCollectionToolbar }: RowProps,
) {
  if (index === 0) {
    return filtersSize + (showCollectionToolbar ? 48 : 0)
  }
  return px("18.9375rem") as number
}

interface RowProps {
  books: BookWithRelations[]
  columnCount: number
  filtersSize: number
  isSelecting: boolean
  selected: Set<UUID>
  onSelect: (uuid: UUID) => void
  filterSortRef: Ref<HTMLDivElement | null>
  filterSortOptions: FilterSortOptions
  showCollectionToolbar: boolean
}

function BookGridItem({
  index,
  books,
  columnCount,
  isSelecting,
  selected,
  onSelect,
  filterSortOptions,
  filterSortRef,
  style,
}: RowComponentProps<RowProps>) {
  if (index === 0) {
    return (
      <div style={style}>
        <FilterSort
          ref={filterSortRef}
          options={filterSortOptions}
          classNames={{ search: { root: "w-1/2 md:w-auto" } }}
        />
      </div>
    )
  }

  const rowIndex = index - 1
  const start = columnCount * rowIndex
  const end = columnCount * (rowIndex + 1)
  const row = books.slice(start, end)

  return (
    <Group style={style} className="gap-6">
      {row.map((book, rowIndex) => (
        <Box
          id={book.uuid}
          style={{ zIndex: books.length - rowIndex }}
          key={book.uuid}
          className="relative scroll-mt-36"
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
        </Box>
      ))}
    </Group>
  )
}

function ScrollNav({
  listRef,
  options,
  books,
  columnCount,
}: {
  listRef: RefObject<ListImperativeAPI | null>
  options: FilterSortOptions
  books: BookWithRelations[]
  columnCount: number
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
        let firstBookIndex = books.findIndex((book) =>
          createComparisonTitle(
            book.title,
            new Intl.Locale(book.language ?? "en"),
          ).startsWith(letter.toLowerCase()),
        )

        firstBookIndex =
          firstBookIndex >= 0
            ? firstBookIndex
            : books.findLastIndex((book) =>
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

        const firstBook = books[firstBookIndex]

        return (
          <Anchor
            key={letter}
            href={`#${firstBook?.uuid}`}
            className="hover:bg-st-orange-100 rounded-md px-2 py-1 text-xs hover:no-underline"
            onClick={(e) => {
              e.preventDefault()
              listRef.current?.scrollToRow({
                index: Math.ceil(firstBookIndex / columnCount),
                align: "center",
                behavior: "smooth",
              })
            }}
          >
            {letter}
          </Anchor>
        )
      })}
    </nav>
  )
}
