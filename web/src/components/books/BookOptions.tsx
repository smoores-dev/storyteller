import { usePermissions } from "@/hooks/usePermissions"
import { ProcessingItems } from "./ProcessingItems"
import { BookWithRelations } from "@/database/books"

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
