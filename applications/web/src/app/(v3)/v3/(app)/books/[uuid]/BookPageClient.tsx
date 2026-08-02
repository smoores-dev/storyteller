"use client"

import { BookDetailsContent } from "@/app/(v3)/v3/_/components/books/BookDetails/BookDetailsPage"
import { useClaimBookPanel } from "@/app/(v3)/v3/_/components/books/FloatingBookPanel"
import { type BookWithRelations } from "@/database/books"
import { type UUID } from "@/uuid"

export function BookPageClient({
  uuid,
  assetsDir,
  initialBook,
}: {
  uuid: UUID
  assetsDir: string
  initialBook: BookWithRelations
}) {
  useClaimBookPanel()

  return (
    <BookDetailsContent
      uuid={uuid}
      assetsDir={assetsDir}
      initialBook={initialBook}
    />
  )
}
