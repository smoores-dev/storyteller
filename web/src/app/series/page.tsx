import { Title } from "@mantine/core"
import { SeriesList } from "@/components/series/SeriesList"
import { assertHasPermission } from "@/auth/auth"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Series",
}

export default async function SeriesPage() {
  await assertHasPermission("bookList")
  return (
    <>
      <Title order={2}>Series</Title>
      <SeriesList />
    </>
  )
}
