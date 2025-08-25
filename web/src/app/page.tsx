import { BookShelves } from "@/components/books/BookShelves"
import { fetchApiRoute } from "./fetchApiRoute"
import { Shelves } from "@/apiModels"

export const dynamic = "force-dynamic"

export default async function Home() {
  const shelves = await fetchApiRoute<Shelves>("/shelves")
  return (
    <>
      <BookShelves shelves={shelves} />
    </>
  )
}
