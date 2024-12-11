import styles from "./page.module.css"
import { BookList } from "@/components/books/BookList"
import { redirect } from "next/navigation"
import { ApiClientError } from "@/apiClient"
import { BookDetail } from "@/apiModels"
import { createAuthedApiClient } from "@/authedApiClient"
import { logger } from "@/logging"

export const dynamic = "force-dynamic"

export default async function Home() {
  const client = await createAuthedApiClient()

  let books: BookDetail[] = []

  try {
    books = await client.listBooks()
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 401) {
      return redirect("/login")
    }

    if (e instanceof ApiClientError && e.statusCode === 403) {
      return (
        <main className={styles["content"]}>
          <h2>Forbidden</h2>
          <p>You don&apos;t have permission to see this page</p>
        </main>
      )
    }

    logger.error(e)

    return (
      <main className={styles["content"]}>
        <h2>API is down</h2>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </main>
    )
  }

  return (
    <main className={styles["main"]}>
      <h2 className={styles["heading"]}>Books</h2>
      <div className={styles["content"]}>
        <BookList books={books} />
      </div>
    </main>
  )
}
