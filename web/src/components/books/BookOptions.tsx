import { BookDetail } from "@/apiModels"
import { usePermissions } from "@/hooks/usePermissions"
import { ProcessingItems } from "./ProcessingItems"
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Radio,
  RadioGroup,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core"
import { IconTrash } from "@tabler/icons-react"
import { useDisclosure } from "@mantine/hooks"
import { useDeleteBookMutation } from "@/store/api"
import { useRouter } from "next/navigation"
import { useForm } from "@mantine/form"

type Props = {
  book: BookDetail
  aligned: boolean
}

export function BookOptions({ book, aligned }: Props) {
  const [opened, { open, close }] = useDisclosure()

  const permissions = usePermissions()

  const [deleteBook] = useDeleteBookMutation()

  const form = useForm({
    initialValues: {
      includeAssets: "" as "" | "all" | "internal",
    },
  })

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
              <Button variant="subtle" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">Delete</Button>
            </Group>
          </form>
        </Stack>
      </Modal>
      <Stack>
        {permissions?.bookProcess && book.processingTask && (
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
