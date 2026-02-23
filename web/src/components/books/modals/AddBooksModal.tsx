import { Button, Group, Modal, Stack } from "@mantine/core"
import { useState } from "react"

import { BookGrid } from "@/components/books/BookGrid"
import { type Collection } from "@/database/collections"
import { useFilterSortedBooks } from "@/hooks/useFilterSortedBooks"
import {
  useAddBooksToCollectionsMutation,
  useListBooksQuery,
} from "@/store/api"
import { type UUID } from "@/uuid"

interface Props {
  isOpen: boolean
  collection: Collection
  onClose: () => void
}

export function AddBooksModal({ isOpen, collection, onClose }: Props) {
  const { potentialBooks } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      potentialBooks: result.data?.filter(
        (book) => !book.collections.some((c) => c.uuid === collection.uuid),
      ),
    }),
  })

  const { books, options } = useFilterSortedBooks(potentialBooks ?? [])

  const [addBooksToCollections, { isLoading }] =
    useAddBooksToCollectionsMutation()

  const [selected, setSelected] = useState(() => new Set<UUID>())

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        setSelected(new Set())
        onClose()
      }}
      title={`Add books to ${collection.name}`}
      centered
      size="xl"
      classNames={{
        body: "h-[calc(100%-60px)]",
      }}
    >
      <Stack className="h-full">
        <BookGrid
          collection={collection}
          setSelected={setSelected}
          isEditing={false}
          setIsEditing={() => {}}
          filterSortOptions={options}
          className="grow overflow-y-auto"
          books={books}
          isSelecting
          selected={selected}
        />
        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={() => {
              setSelected(new Set())
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={isLoading}
            onClick={async () => {
              await addBooksToCollections({
                collections: [collection.uuid],
                books: Array.from(selected),
              })

              onClose()
            }}
          >
            {isLoading ? "Adding…" : "Add to collection"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
