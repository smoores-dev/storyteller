"use client"

import { BookDetail } from "@/apiClient"
import { AddBookModal } from "./AddBookModal"
import { BookStatus } from "./BookStatus"
import styles from "./books.module.css"
import { useState } from "react"

type Props = {
  apiHost: string
  books: BookDetail[]
}

export function BookList({ apiHost, books: initialBooks }: Props) {
  const [books, setBooks] = useState(initialBooks)

  return (
    <>
      <AddBookModal
        apiHost={apiHost}
        onSubmit={(book) => setBooks((books) => [...books, book])}
      />
      <ul>
        {books.map((book) => (
          <li key={book.id} className={styles["book-status"]}>
            <BookStatus apiHost={apiHost} book={book} />
          </li>
        ))}
      </ul>
    </>
  )
}
