"use client"

import { BookDetail } from "@/apiModels"
import { AddBookModal } from "./AddBookModal"
import { BookStatus } from "./BookStatus"
import styles from "./books.module.css"
import { useState } from "react"

type Props = {
  books: BookDetail[]
}

export function BookList({ books: initialBooks }: Props) {
  const [books, setBooks] = useState(initialBooks)

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
