import { type BookWithRelations } from "@/database/books"
import { usePermissions } from "@/hooks/usePermissions"

import { ProcessingItems } from "./ProcessingItems"

type Props = {
  book: BookWithRelations
  aligned: boolean
}

export function BookOptions({ book, aligned }: Props) {
  const permissions = usePermissions()

  return (
    <>
      {permissions?.bookProcess &&
        book.readaloud &&
        book.readaloud.status !== "CREATED" && (
          <ProcessingItems aligned={aligned} book={book} />
        )}
    </>
  )
}
