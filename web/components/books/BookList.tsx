"use client"

import { BookDetail } from "@/apiModels"
import { BookStatus } from "./BookStatus"
import styles from "./books.module.css"
import { useCallback, useEffect, useState } from "react"
import { useApiClient } from "@/hooks/useApiClient"
import { AddBookForm } from "./AddBookForm"

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
    }, 5000)
    return () => clearInterval(intervalId)
  }, [refreshBooks])

  return (
    <>
      <AddBookForm onAdded={refreshBooks} />
      {/* <AddBookModal /> */}
      <ul className={styles["book-list"]}>
        {books.map((book) => (
          <li key={book.uuid} className={styles["book-status"]}>
            <BookStatus book={book} onUpdate={refreshBooks} />
          </li>
        ))}
      </ul>
    </>
  )
}
