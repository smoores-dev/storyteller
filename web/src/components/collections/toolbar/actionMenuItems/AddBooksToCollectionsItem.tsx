import { CollectionsInput } from "@/components/books/edit/CollectionsInput"
import {
  useAddBooksToCollectionsMutation,
  useCreateCollectionMutation,
  useGetCurrentUserQuery,
  useListCollectionsQuery,
  useListUsersQuery,
} from "@/store/api"
import { UUID } from "@/uuid"
import { Button, MenuItem, Modal } from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconBooks } from "@tabler/icons-react"
import { useState } from "react"

interface Props {
  selected: Set<UUID>
}

export function AddBooksToCollectionsItem({ selected }: Props) {
  const { data: currentUser } = useGetCurrentUserQuery()

  const [addBooksToCollections, { isLoading }] =
    useAddBooksToCollectionsMutation()
  const [createCollection] = useCreateCollectionMutation()

  const { data: users = [] } = useListUsersQuery()
  const { data: collections = [] } = useListCollectionsQuery()

  const [isOpen, setIsOpen] = useState(false)

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
          setIsOpen(false)
        }}
        title="Add books to collections"
        centered
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.onSubmit(async (values) => {
            await addBooksToCollections({
              collections: values.collections,
              books: Array.from(selected),
            })

            form.reset()
            setIsOpen(false)
          })}
        >
          <CollectionsInput
            getInputProps={form.getInputProps}
            collections={collections}
            values={form.values.collections}
            users={users}
            onCollectionAdd={async (values) => {
              if (
                !values.public &&
                currentUser &&
                !values.users.includes(currentUser.id)
              ) {
                values.users.push(currentUser.id)
              }
              await createCollection(values)
            }}
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </form>
      </Modal>
      <MenuItem
        leftSection={<IconBooks size={14} />}
        onClick={() => {
          setIsOpen(true)
        }}
      >
        Add to collection
      </MenuItem>
    </>
  )
}
