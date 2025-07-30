import { BookShelves } from "@/components/books/BookShelves"
import { fetchApiRoute } from "./fetchApiRoute"
import { BookDetail, Shelves } from "@/apiModels"

export const dynamic = "force-dynamic"

export default async function Home() {
  const shelves = await fetchApiRoute<Shelves>("/shelves")
  const books = await fetchApiRoute<BookDetail[]>("/books")
  return (
    <>
      <BookShelves shelves={shelves} books={books} />
    </>
  )
}
