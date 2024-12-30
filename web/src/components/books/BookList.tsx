"use client"

import { BookDetail } from "@/apiModels"
import { BookStatus } from "./BookStatus"
import { AddBookForm } from "./AddBookForm"
import { usePermission } from "@/contexts/UserPermissions"
import { useLiveBooks } from "@/hooks/useLiveBooks"
import { List } from "@mantine/core"

type Props = {
  books: BookDetail[]
}

export function BookList({ books: initialBooks }: Props) {
  const canListBooks = usePermission("book_list")
  const books = useLiveBooks(initialBooks)

  return (
    <>
      <AddBookForm />
      {canListBooks && (
        <List listStyleType="none">
          {books.map((book) => (
            <List.Item
              key={book.uuid}
              className="my-8"
              classNames={{ itemWrapper: "block" }}
            >
              <BookStatus book={book} />
            </List.Item>
          ))}
        </List>
      )}
    </>
  )
}
