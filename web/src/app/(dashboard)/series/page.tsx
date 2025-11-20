import { Title } from "@mantine/core"
import { type Metadata } from "next"

import { assertHasPermission } from "@/auth/auth"
import { SeriesList } from "@/components/series/SeriesList"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Series",
}

export default async function SeriesPage() {
  await assertHasPermission("bookList")
  return (
    <>
      <Title order={2} size="h3">
        Series
      </Title>
      <SeriesList />
    </>
  )
}
