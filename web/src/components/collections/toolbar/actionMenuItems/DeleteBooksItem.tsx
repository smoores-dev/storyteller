import {
  Button,
  Checkbox,
  Group,
  MenuItem,
  Modal,
  Radio,
  RadioGroup,
  Stack,
  Text,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { IconBooksOff } from "@tabler/icons-react"

import { type BookWithRelations } from "@/database/books"
import { usePermissions } from "@/hooks/usePermissions"
import { useDeleteBooksMutation, useListBooksQuery } from "@/store/api"
import { type UUID } from "@/uuid"

import { TitleSummary } from "./TitleSummary"

const EMPTY_BOOKS: BookWithRelations[] = []

interface Props {
  selected: Set<UUID>
  onCommit: () => void
}

export function DeleteBooksItem({ selected, onCommit }: Props) {
  const { books } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      books:
        result.data?.filter((book) => selected.has(book.uuid)) ?? EMPTY_BOOKS,
    }),
  })

  const [isOpen, { open, close }] = useDisclosure()

  const permissions = usePermissions()

  const [deleteBooks] = useDeleteBooksMutation()

  const form = useForm({
    initialValues: {
      includeAssets: "" as "" | "all" | "internal",
      preventReImport: false,
    },
  })

  if (!permissions?.bookDelete) {
    return null
  }

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={close}
        title="Deleting books"
        centered
        size="sm"
      >
        <Stack>
          <Text>
            Are you sure you want to delete <TitleSummary books={books} />?
          </Text>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.onSubmit(
              async ({ includeAssets, preventReImport }) => {
                onCommit()

                await deleteBooks({
                  books: Array.from(selected),
                  ...(includeAssets && { includeAssets }),
                  preventReImport,
                })
              },
            )}
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

            <Checkbox
              label="Prevent these books from being re-imported"
              {...form.getInputProps("preventReImport", { type: "checkbox" })}
            />

            <Group justify="space-between">
              <Button variant="subtle" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">Delete</Button>
            </Group>
          </form>
        </Stack>
      </Modal>
      <MenuItem
        leftSection={<IconBooksOff size={14} className="text-red-600" />}
        onClick={() => {
          open()
        }}
      >
        Delete books
      </MenuItem>
    </>
  )
}
