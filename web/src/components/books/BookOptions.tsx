import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import { usePermissions } from "@/contexts/UserPermissions"
import { ProcessingItems } from "./ProcessingItems"
import { ActionIcon, Button, Group, Modal, Stack, Tooltip } from "@mantine/core"
import { IconPencil, IconTrash } from "@tabler/icons-react"
import NextLink from "next/link"
import { useDisclosure } from "@mantine/hooks"

type Props = {
  book: BookDetail
  synchronized: boolean
}

export function BookOptions({ book, synchronized }: Props) {
  const [opened, { open, close }] = useDisclosure()
  const client = useApiClient()

  const permissions = usePermissions()

  return (
    <>
      <Modal
        opened={opened}
        onClose={close}
        title="Deleting book"
        centered
        size="sm"
      >
        <Stack>
          Are you sure you want to delete {book.title} by{" "}
          {book.authors[0]?.name}?
          <Group justify="space-between">
            <Button variant="subtle" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void client.deleteBook(book.uuid)
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
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
          <ActionIcon variant="subtle" color="red" onClick={open}>
            <Tooltip position="right" label="Delete book">
              <IconTrash aria-label="Delete" />
            </Tooltip>{" "}
          </ActionIcon>
        )}
      </Stack>
    </>
  )
}
