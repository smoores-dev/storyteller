import { BookDetail } from "@/apiModels"
import { usePermissions } from "@/hooks/usePermissions"
import { ProcessingItems } from "./ProcessingItems"
import { ActionIcon, Button, Group, Modal, Stack, Tooltip } from "@mantine/core"
import { IconTrash } from "@tabler/icons-react"
import { useDisclosure } from "@mantine/hooks"
import { useDeleteBookMutation } from "@/store/api"
import { useRouter } from "next/navigation"

type Props = {
  book: BookDetail
  aligned: boolean
}

export function BookOptions({ book, aligned }: Props) {
  const [opened, { open, close }] = useDisclosure()

  const permissions = usePermissions()

  const [deleteBook] = useDeleteBookMutation()

  const router = useRouter()

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
              onClick={async () => {
                await deleteBook({ uuid: book.uuid })
                router.back()
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Stack>
        {permissions?.bookProcess &&
          book.processingTask &&
          book.originalFilesExist && (
            <ProcessingItems aligned={aligned} book={book} />
          )}
        {permissions?.bookDelete && (
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
