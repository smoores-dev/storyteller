import { BookDetail } from "@/apiModels"
import { Fragment } from "react"

interface Props {
  books: BookDetail[]
}

export function TitleSummary({ books }: Props) {
  if (books.length > 3) {
    return (
      <>
        {books.slice(0, 3).map((book, i, array) => (
          <Fragment key={book.uuid}>
            <strong>{book.title}</strong>
            {i !== array.length - 1 ? ", " : ""}
          </Fragment>
        ))}
        , and {books.length - 3} more
      </>
    )
  }

  if (books.length > 2) {
    return (
      <>
        {books.slice(0, 2).map((book, i, array) => (
          <Fragment key={book.uuid}>
            <strong key={book.uuid}>{book.title}</strong>
            {i !== array.length - 1 ? ", " : ""}
          </Fragment>
        ))}
        , and {books[2]?.title}
      </>
    )
  }

  if (books.length > 1) {
    return (
      <>
        <strong>{books[0]?.title}</strong> and{" "}
        <strong>{books[1]?.title}</strong>
      </>
    )
  }

  return <strong>{books[0]?.title}</strong>
}
