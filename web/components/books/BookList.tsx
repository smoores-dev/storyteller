"use client"

import { BookDetail } from "@/apiModels"
import { AddBookModal } from "./AddBookModal"
import { BookStatus } from "./BookStatus"
import styles from "./books.module.css"
import { useCallback, useEffect, useState } from "react"
import { useApiClient } from "@/hooks/useApiClient"

type Props = {
  books: BookDetail[]
}

export function BookList({ books: initialBooks }: Props) {
  const client = useApiClient()
  const [books, setBooks] = useState(initialBooks)

  const refreshBooks = useCallback(() => {
    client.listBooks().then((books) => setBooks(books))
  }, [client])

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshBooks()
    }, 20000)
    return () => clearInterval(intervalId)
  }, [refreshBooks])

  return (
    <>
      <AddBookModal />
      <ul>
        {books.map((book) => (
          <li key={book.uuid} className={styles["book-status"]}>
            <BookStatus book={book} onUpdate={refreshBooks} />
          </li>
        ))}
      </ul>
    </>
  )
}
