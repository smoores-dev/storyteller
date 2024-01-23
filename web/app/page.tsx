import styles from "./page.module.css"
import { BookList } from "@/components/books/BookList"
import { redirect } from "next/navigation"
import { cookies, headers } from "next/headers"
import { ApiClient, ApiClientError } from "@/apiClient"
import { BookDetail, Token } from "@/apiModels"
import { rootPath } from "./apiHost"

export const dynamic = "force-dynamic"

export default async function Home() {
  const cookieStore = cookies()
  const authTokenCookie = cookieStore.get("st_token")
  if (!authTokenCookie) {
    return redirect("/login")
  }

  const token = JSON.parse(atob(authTokenCookie.value)) as Token
  const origin = headers().get("x-storyteller-origin")!
  const client = new ApiClient(origin, rootPath, token.access_token)

  let books: BookDetail[] = []

  try {
    books = await client.listBooks()
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 401) {
      return redirect("/login")
    }

    if (e instanceof ApiClientError && e.statusCode === 403) {
      return (
        <main className={styles["main"]}>
          <h2>Forbidden</h2>
          <p>You don&apos;t have permission to see this page</p>
        </main>
      )
    }

    console.error(e)

    return (
      <main className={styles["main"]}>
        <h2>API is down</h2>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </main>
    )
  }

  return (
    <main className={styles["main"]}>
      <h2>Your books</h2>
      <BookList books={books} />
      <p>
        You&apos;re running Storyteller v2! There are no breaking changes, but
        if you haven&apos;t yet,{" "}
        <a href="https://smoores.gitlab.io/storyteller/docs/migrations/from-v1-to-v2">
          take a look at the docs
        </a>{" "}
        to see how you can simplify your Storyteller setup.
      </p>
    </main>
  )
}
