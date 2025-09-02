import { Button, MenuItem, Modal } from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { IconTags } from "@tabler/icons-react"

import { TagsInput } from "@/components/books/edit/TagsInput"
import { useAddTagsToBooksMutation, useListTagsQuery } from "@/store/api"
import { type UUID } from "@/uuid"

interface Props {
  selected: Set<UUID>
}

export function AddTagsToBooksItem({ selected }: Props) {
  const [addTagsToBooks, { isLoading }] = useAddTagsToBooksMutation()

  const { data: tags = [], refetch } = useListTagsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })

  const [isOpen, { open, close }] = useDisclosure()

  const form = useForm({
    initialValues: {
      tags: [] as string[],
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
        title="Add tags to books"
        centered
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.onSubmit(async (values) => {
            await addTagsToBooks({
              tags: values.tags,
              books: Array.from(selected),
            })
            await refetch()

            form.reset()
            close()
          })}
        >
          <TagsInput tags={tags} {...form.getInputProps("tags")} />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </form>
      </Modal>
      <MenuItem
        leftSection={<IconTags size={14} />}
        onClick={() => {
          open()
        }}
      >
        Add tags
      </MenuItem>
    </>
  )
}
