import { BookDetail } from "@/apiModels"
import { usePermissions } from "@/hooks/usePermissions"
import { useDeleteBooksMutation, useListBooksQuery } from "@/store/api"
import { UUID } from "@/uuid"
import {
  Button,
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
import { Fragment, useMemo } from "react"

const EMPTY_BOOKS: BookDetail[] = []

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

  const titleSummary = useMemo(() => {
    if (books.length > 3) {
      return (
        <>
          {books.slice(0, 3).map((book, i, array) => (
            <Fragment key={book.uuid}>
              <strong>{book.title}</strong>
              {i !== array.length - 1 ? ", " : ""}
            </Fragment>
          ))}
          , and {books.length - 3} more
        </>
      )
    }

    if (books.length > 2) {
      return (
        <>
          {books.slice(0, 2).map((book, i, array) => (
            <Fragment key={book.uuid}>
              <strong key={book.uuid}>{book.title}</strong>
              {i !== array.length - 1 ? ", " : ""}
            </Fragment>
          ))}
          , and {books[2]?.title}
        </>
      )
    }

    if (books.length > 1) {
      return (
        <>
          <strong>{books[0]?.title}</strong> and{" "}
          <strong>{books[1]?.title}</strong>
        </>
      )
    }

    return <strong>{books[0]?.title}</strong>
  }, [books])

  const form = useForm({
    initialValues: {
      includeAssets: "" as "" | "all" | "internal",
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
          <Text>Are you sure you want to delete {titleSummary}?</Text>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.onSubmit(async ({ includeAssets }) => {
              onCommit()
              await deleteBooks({
                books: Array.from(selected),
                ...(includeAssets && { includeAssets }),
              })
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
