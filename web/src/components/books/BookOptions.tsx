import { BookDetail } from "@/apiModels"
import { usePermissions } from "@/hooks/usePermissions"
import { ProcessingItems } from "./ProcessingItems"

type Props = {
  book: BookDetail
  aligned: boolean
}

export function BookOptions({ book, aligned }: Props) {
  const permissions = usePermissions()

  return (
    <>
      {permissions?.bookProcess && book.processingTask && (
        <ProcessingItems aligned={aligned} book={book} />
      )}
    </>
  )
}
