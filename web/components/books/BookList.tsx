"use client"

import { BookDetail } from "@/apiModels"
import { AddBookModal } from "./AddBookModal"
import { BookStatus } from "./BookStatus"
import styles from "./books.module.css"
import { useEffect, useState } from "react"
import { useApiClient } from "@/hooks/useApiClient"

type Props = {
  books: BookDetail[]
}

export function BookList({ books: initialBooks }: Props) {
  const client = useApiClient()
  const [books, setBooks] = useState(initialBooks)

  useEffect(() => {
    const intervalId = setInterval(() => {
      client.listBooks().then((books) => setBooks(books))
    }, 20000)
    return () => clearInterval(intervalId)
  }, [client])

  return (
    <>
      <AddBookModal
        onSubmit={(book) => setBooks((books) => [book, ...books])}
      />
      <ul>
        {books.map((book) => (
          <li key={book.id} className={styles["book-status"]}>
            <BookStatus book={book} />
          </li>
        ))}
      </ul>
    </>
  )
}
