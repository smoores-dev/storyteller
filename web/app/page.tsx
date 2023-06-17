import styles from "./page.module.css"
import { AddBookModal } from "./components/AddBookModal"

export default async function Home() {
  const apiHost = process.env["STORYTELLER_API_HOST"] ?? ""
  const booksResponse = await fetch(`${apiHost}/books`)
  const books = await booksResponse.json()
  return (
    <main className={styles.main}>
      <h2>Your books</h2>
      <AddBookModal apiHost={apiHost} />
      <ul>
        {books.map((book) => (
          <li>
            <div>{book.title}</div>
            <div>by {book.authors[0].name}</div>
            {book.processing_status && (
              <div>
                Status: {book.processing_status.current_task} -{" "}
                {Math.floor(book.processing_status.progress * 100)}%
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
