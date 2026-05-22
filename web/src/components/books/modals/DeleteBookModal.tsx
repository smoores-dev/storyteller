import { Button, Checkbox, Group, Modal, Stack, Text } from "@mantine/core"
import { useForm } from "@mantine/form"
import { useRouter } from "next/navigation"

import { type BookWithRelations } from "@/database/books"
import { useDeleteBookMutation } from "@/store/api"

interface Props {
  isOpen: boolean
  onClose: () => void
  book: BookWithRelations
}

export function DeleteBookModal({ isOpen, onClose, book }: Props) {
  const [deleteBook] = useDeleteBookMutation()

  const form = useForm({
    initialValues: {
      preventReImport: false,
    },
  })

  const router = useRouter()
  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="Deleting book"
      centered
      size="sm"
    >
      <Stack>
        <Text>
          Are you sure you want to delete <strong>{book.title}</strong> by{" "}
          {book.authors[0]?.name}?
        </Text>
        <Text size="sm" c="dimmed">
          Library-owned files will be deleted. Files in your watch folders
          (reference imports) are left on disk.
        </Text>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.onSubmit(async ({ preventReImport }) => {
            await deleteBook({
              uuid: book.uuid,
              preventReImport,
            })
            router.back()
          })}
        >
          <Checkbox
            label="Prevent this book from being re-imported"
            {...form.getInputProps("preventReImport", { type: "checkbox" })}
          />

          <Group justify="space-between">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button color="red" type="submit">
              Delete
            </Button>
          </Group>
        </form>
      </Stack>
    </Modal>
  )
}
