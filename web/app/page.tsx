import styles from "./page.module.css"
import { ApiClient, ApiError, BookDetail, Token } from "@/apiClient"
import { BookList } from "@/components/books/BookList"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

export default async function Home() {
  const apiHost = process.env["STORYTELLER_API_HOST"] ?? ""
  const cookieStore = cookies()
  const authTokenCookie = cookieStore.get("st_token")
  if (!authTokenCookie) {
    return redirect("/login")
  }

  const token = JSON.parse(atob(authTokenCookie.value)) as Token
  const client = new ApiClient({
    BASE: apiHost,
    TOKEN: token.access_token,
  })
  let books: BookDetail[] = []
  try {
    books = await client.default.listBooksBooksGet()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      return redirect("/login")
    }
    console.error(e)
  }
  return (
    <main className={styles["main"]}>
      <h2>Your books</h2>
      <BookList apiHost={apiHost} books={books} />
    </main>
  )
}
