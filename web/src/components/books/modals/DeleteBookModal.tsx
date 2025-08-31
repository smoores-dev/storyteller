import { BookWithRelations } from "@/database/books"
import { useDeleteBookMutation } from "@/store/api"
import {
  Modal,
  Stack,
  RadioGroup,
  Radio,
  Group,
  Button,
  Text,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { useRouter } from "next/navigation"

interface Props {
  isOpen: boolean
  onClose: () => void
  book: BookWithRelations
}

export function DeleteBookModal({ isOpen, onClose, book }: Props) {
  const [deleteBook] = useDeleteBookMutation()

  const form = useForm({
    initialValues: {
      includeAssets: "" as "" | "all" | "internal",
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
        <form
          className="flex flex-col gap-4"
          onSubmit={form.onSubmit(async ({ includeAssets }) => {
            await deleteBook({
              uuid: book.uuid,
              ...(includeAssets && { includeAssets }),
            })
            router.back()
          })}
        >
          <RadioGroup
            label="Delete files?"
            classNames={{
              label: "my-2",
            }}
            {...form.getInputProps("includeAssets")}
          >
            <Stack gap={12}>
              <Radio value="" label="Leave all files in place" />
              <Radio
                value="internal"
                label="Delete Storyteller files, like transcriptions and processed audio files"
              />
              <Radio
                value="all"
                label="Delete all files, including the book assets (EPUB and audio files)"
              />
            </Stack>
          </RadioGroup>
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
