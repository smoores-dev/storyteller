import { Series } from "@/database/series"
import { fetchApiRoute } from "../fetchApiRoute"
import { Title } from "@mantine/core"
import { BookDetail } from "@/apiModels"
import { SeriesList } from "@/components/series/SeriesList"

export const dynamic = "force-dynamic"

export default async function SeriesPage() {
  const series = await fetchApiRoute<Series[]>("/series")
  const books = await fetchApiRoute<BookDetail[]>("/books")

  return (
    <>
      <Title order={2}>Series</Title>
      <SeriesList series={series} books={books} />
    </>
  )
}
