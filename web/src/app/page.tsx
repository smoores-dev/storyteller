import { BookShelves } from "@/components/books/BookShelves"
import { fetchApiRoute } from "./fetchApiRoute"
import { Shelves } from "@/apiModels"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Home | Storyteller",
}

export default async function Home() {
  const shelves = await fetchApiRoute<Shelves>("/shelves")
  return (
    <>
      <BookShelves shelves={shelves} />
    </>
  )
}
