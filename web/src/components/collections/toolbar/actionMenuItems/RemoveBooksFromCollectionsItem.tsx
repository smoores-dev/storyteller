import { Collection } from "@/database/collections"
import {
  useListBooksQuery,
  useRemoveBooksFromCollectionsMutation,
} from "@/store/api"
import { UUID } from "@/uuid"
import { Button, MenuItem, Modal, MultiSelect } from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { IconBooks } from "@tabler/icons-react"

const EMPTY_COLLECTIONS: Collection[] = []

interface Props {
  selected: Set<UUID>
}

export function RemoveBooksFromCollectionsItem({ selected }: Props) {
  const { collections } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      collections: result.data
        ? Array.from(
            result.data
              .reduce((acc, book) => {
                book.collections.forEach((collection) => {
                  acc.set(collection.uuid, collection)
                })
                return acc
              }, new Map<UUID, Collection>())
              .values(),
          )
        : EMPTY_COLLECTIONS,
    }),
  })

  const [removeBooksFromCollections, { isLoading }] =
    useRemoveBooksFromCollectionsMutation()

  const [isOpen, { open, close }] = useDisclosure()

  const form = useForm({
    initialValues: {
      collections: [] as UUID[],
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
        title="Remove books from collections"
        centered
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.onSubmit(async (values) => {
            await removeBooksFromCollections({
              collections: values.collections,
              books: Array.from(selected),
            })

            form.reset()
            close()
          })}
        >
          <MultiSelect
            label="Collections"
            placeholder="Remove from collections"
            data={collections.map((collection) => ({
              label: collection.name,
              value: collection.uuid,
            }))}
            {...form.getInputProps("collections")}
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </form>
      </Modal>
      <MenuItem
        leftSection={<IconBooks size={14} className="text-red-600" />}
        onClick={() => {
          open()
        }}
      >
        Remove from collections
      </MenuItem>
    </>
  )
}
