import styles from "./page.module.css"
import { BookList } from "@/components/books/BookList"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { ApiClient, ApiClientError } from "@/apiClient"
import { BookDetail, Token } from "@/apiModels"

export const dynamic = "force-dynamic"

export default async function Home() {
  const cookieStore = cookies()
  const authTokenCookie = cookieStore.get("st_token")
  if (!authTokenCookie) {
    return redirect("/login")
  }

  const token = JSON.parse(atob(authTokenCookie.value)) as Token
  const client = new ApiClient(token.access_token)

  let books: BookDetail[] = []

  try {
    books = await client.listBooks()
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 401) {
      return redirect("/login")
    }
    console.error(e)
  }
  return (
    <main className={styles["main"]}>
      <h2>Your books</h2>
      <BookList books={books} />
    </main>
  )
}
