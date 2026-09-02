import { type Metadata } from "next"
import { notFound } from "next/navigation"

import { Reader } from "@v3/_/components/reader/Reader"

import { getBook } from "@/database/books"
import { type ReadingMode } from "@/store/slices/readingSessionSlice"
import { type UUID } from "@/uuid"
import { PiPProvider } from "@/app/(v3)/v3/_/components/reader/PipProvider"

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
  const book = await getBook(uuid)

  if (!book) {
    notFound()
  }

  const emoji = mode === "audiobook" ? "🎧" : "📖"

  return {
    title: `${emoji} ${book.title}`,
  }
}

export default async function BookReadPage({ params, searchParams }: Props) {
  const { uuid } = await params
  const { mode } = await searchParams
  const book = await getBook(uuid)

  if (!book) {
    notFound()
  }

  return (
    // id here to give it the same bg color as the rest of the reader
    <div className={`bg-reader-bg absolute inset-0`}>
      <PiPProvider>
        <Reader book={book} mode={mode} />
      </PiPProvider>
    </div>
  )
}
