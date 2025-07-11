import { List, Checkbox } from "@mantine/core"
import { BookThumbnail } from "./BookThumbnail"
import { BookDetail } from "@/apiModels"
import { UUID } from "@/uuid"
import cx from "classnames"

interface Props {
  className?: string
  books: BookDetail[]
  isSelecting: boolean
  selected: Set<UUID>
  onSelect: (book: UUID) => void
}

export function BookGrid({
  className,
  books,
  isSelecting,
  selected,
  onSelect,
}: Props) {
  return (
    <List
      listStyleType="none"
      className={cx("mt-8 flex flex-row flex-wrap gap-6", className)}
    >
      {books.map((book) => (
        <List.Item
          key={book.uuid}
          className="relative"
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
  )
}
