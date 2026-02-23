import { type Metadata } from "next"

import { fetchApiRoute } from "@/app/fetchApiRoute"
import { Reader } from "@/components/reader/Reader"
import { type BookWithRelations } from "@/database/books"
import { type ReadingMode } from "@/store/slices/readingSessionSlice"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{
    uuid: UUID
  }>
  searchParams: Promise<{
    mode?: ReadingMode
  }>
}

export const generateMetadata = async ({
  params,
  searchParams,
}: Props): Promise<Metadata> => {
  const { uuid } = await params
  const { mode } = await searchParams
  const book = await fetchApiRoute<BookWithRelations>(`/books/${uuid}`)
  const emoji = mode === "audiobook" ? "🎧" : "📖"

  return {
    title: `${emoji} ${book.title} | Books`,
  }
}

export default async function BookReadPage({ params, searchParams }: Props) {
  const { uuid } = await params
  const { mode } = await searchParams
  const book = await fetchApiRoute<BookWithRelations>(`/books/${uuid}`)
  return (
    // id here to give it the same bg color as the rest of the reader
    <div className={`bg-reader-bg absolute inset-0 z-200`}>
      <Reader book={book} mode={mode} />
    </div>
  )
}
