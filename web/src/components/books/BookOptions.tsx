import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import { usePermissions } from "@/contexts/UserPermissions"
import { ProcessingItems } from "./ProcessingItems"
import { ActionIcon, Stack, Tooltip } from "@mantine/core"
import { IconPencil, IconTrash } from "@tabler/icons-react"
import NextLink from "next/link"

type Props = {
  book: BookDetail
  synchronized: boolean
}

export function BookOptions({ book, synchronized }: Props) {
  const client = useApiClient()

  const permissions = usePermissions()

  return (
    <Stack>
      {permissions.book_update && (
        <ActionIcon
          component={NextLink}
          variant="subtle"
          color="black"
          href={`/books/${book.uuid}`}
        >
          <Tooltip position="right" label="Edit">
            <IconPencil aria-label="Edit" />
          </Tooltip>
        </ActionIcon>
      )}
      {permissions.book_process &&
        book.processing_status &&
        book.original_files_exist && (
          <ProcessingItems synchronized={synchronized} book={book} />
        )}
      {permissions.book_delete && (
        <ActionIcon
          variant="subtle"
          color="red"
          onClick={() => {
            void client.deleteBook(book.uuid)
          }}
        >
          <Tooltip position="right" label="Delete book">
            <IconTrash aria-label="Delete" />
          </Tooltip>{" "}
        </ActionIcon>
      )}
    </Stack>
  )
}
