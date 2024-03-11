import { ApiClientError } from "@/apiClient"
import { BookDetail } from "@/apiModels"
import { redirect } from "next/navigation"
import styles from "./page.module.css"
import { createAuthedApiClient } from "@/authedApiClient"
import { BookEditForm } from "@/components/books/BookEditForm"

type Props = {
  params: {
    uuid: string
  }
}

export default async function BookEdit({ params: { uuid } }: Props) {
  const client = createAuthedApiClient()

  let book: BookDetail | null = null

  try {
    book = await client.getBookDetails(uuid)
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 401) {
      return redirect("/login")
    }

    if (e instanceof ApiClientError && e.statusCode === 403) {
      return (
        <main>
          <h2>Forbidden</h2>
          <p>You don&apos;t have permission to see this page</p>
        </main>
      )
    }

    console.error(e)

    return (
      <main>
        <h2>API is down</h2>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </main>
    )
  }

  return (
    <main>
      <h2 className={styles["heading"]}>{book.title}</h2>
      <section className={styles["section"]}>
        <BookEditForm book={book} />
      </section>
    </main>
  )
}
