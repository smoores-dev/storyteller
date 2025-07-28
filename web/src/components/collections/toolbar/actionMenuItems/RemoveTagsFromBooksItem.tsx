import { SeriesRelation } from "@/database/books"
import { useListBooksQuery, useRemoveTagsFromBooksMutation } from "@/store/api"
import { UUID } from "@/uuid"
import { Button, MenuItem, Modal, MultiSelect } from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { IconTagsOff } from "@tabler/icons-react"

interface Props {
  selected: Set<UUID>
}

export function RemoveTagsFromBooksItem({ selected }: Props) {
  const { tags } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      tags: result.data
        ? Array.from(
            result.data
              .filter((book) => selected.has(book.uuid))
              .reduce((acc, book) => {
                book.tags.forEach((tag) => {
                  acc.set(tag.uuid, tag)
                })

                return acc
              }, new Map<UUID, SeriesRelation>())
              .values(),
          )
        : [],
    }),
  })

  const [removeTagsFromBooks, { isLoading }] = useRemoveTagsFromBooksMutation()

  const [isOpen, { close, open }] = useDisclosure()

  const form = useForm({
    initialValues: {
      tags: [] as UUID[],
    },
  })

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={() => {
          form.reset()
          close()
        }}
        title="Remove tags from books"
        centered
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.onSubmit(async (values) => {
            await removeTagsFromBooks({
              tags: values.tags,
              books: Array.from(selected),
            })

            form.reset()
            close()
          })}
        >
          <MultiSelect
            label="Tags"
            placeholder="Remove tags"
            data={tags.map((t) => ({
              label: t.name,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              value: t.uuid!,
            }))}
            {...form.getInputProps("tags")}
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </form>
      </Modal>
      <MenuItem
        leftSection={<IconTagsOff size={14} className="text-red-600" />}
        onClick={() => {
          open()
        }}
      >
        Remove tags
      </MenuItem>
    </>
  )
}
