"use client"

import { AddBookForm } from "./AddBookForm"
import { usePermission } from "@/contexts/UserPermissions"
import { Group, List, Stack } from "@mantine/core"
import { BookThumbnail } from "./BookThumbnail"
import { useFilterSortedBooks } from "@/hooks/useFilterSortedBooks"
import { Search } from "./Search"
import { Sort } from "./Sort"
import { useBooks } from "./LiveBooksProvider"

export function BookList() {
  const canListBooks = usePermission("bookList")

  const liveBooks = useBooks()
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
