import { type Metadata } from "next"
import { notFound } from "next/navigation"

import { Reader } from "@v3/_/components/reader/Reader"

import { getBook } from "@/database/books"
import { type ReadingMode } from "@/store/slices/readingSessionSlice"
import { type UUID } from "@/uuid"

const readingModes = [
  "epub",
  "audiobook",
  "readaloud",
] as const satisfies ReadingMode[]

const parseMode = (mode: string | undefined) =>
  readingModes.find((candidate) => candidate === mode)

type Props = {
  params: Promise<{
    uuid: UUID
  }>
  searchParams: Promise<{
    mode?: string
    href?: string
  }>
}

export const generateMetadata = async ({
  params,
  searchParams,
}: Props): Promise<Metadata> => {
  const [{ uuid }, { mode }] = await Promise.all([params, searchParams])
  const book = await getBook(uuid)

  if (!book) {
    notFound()
  }

  return {
    title: `${parseMode(mode) === "audiobook" ? "🎧" : "📖"} ${book.title}`,
  }
}

export default async function BookReadPage({ params, searchParams }: Props) {
  const [{ uuid }, { mode, href }] = await Promise.all([params, searchParams])
  const book = await getBook(uuid)

  if (!book) {
    notFound()
  }

  return (
    <main className="bg-reader-bg absolute inset-0">
      <Reader book={book} mode={parseMode(mode)} startHref={href} />
    </main>
  )
}
