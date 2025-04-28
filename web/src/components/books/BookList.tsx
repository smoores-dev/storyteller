"use client"

import { BookDetail } from "@/apiModels"
import { AddBookForm } from "./AddBookForm"
import { usePermission } from "@/contexts/UserPermissions"
import { useLiveBooks } from "@/hooks/useLiveBooks"
import { Group, List, Stack } from "@mantine/core"
import { BookThumbnail } from "./BookThumbnail"
import { useFilterSortedBooks } from "@/hooks/useFilterSortedBooks"
import { Search } from "./Search"
import { Sort } from "./Sort"

type Props = {
  books: BookDetail[]
}

export function BookList({ books: initialBooks }: Props) {
  const canListBooks = usePermission("bookList")

  const liveBooks = useLiveBooks(initialBooks)
  const { books, onFilterChange, filter, sort, onSortChange } =
    useFilterSortedBooks(liveBooks)

  return (
    <>
      <AddBookForm />
      {canListBooks && (
        <Stack>
          <Group>
            <Search value={filter} onValueChange={onFilterChange} />
            <Sort value={sort} onValueChange={onSortChange} />
          </Group>
          <List listStyleType="none" className="flex flex-row flex-wrap gap-8">
            {books.map((book) => (
              <List.Item
                key={book.uuid}
                className="my-8"
                classNames={{ itemWrapper: "block" }}
              >
                <BookThumbnail book={book} />
              </List.Item>
            ))}
          </List>
        </Stack>
      )}
    </>
  )
}
