import { BookGrid } from "@/components/books/BookGrid"
import { Search } from "@/components/books/Search"
import { Sort } from "@/components/books/Sort"
import { Collection } from "@/database/collections"
import { useFilterSortedBooks } from "@/hooks/useFilterSortedBooks"
import {
  useAddBooksToCollectionsMutation,
  useListBooksQuery,
} from "@/store/api"
import { UUID } from "@/uuid"
import { Button, Group, Modal, Stack } from "@mantine/core"
import { useState } from "react"

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

  const { books, onFilterChange, filter, sort, onSortChange } =
    useFilterSortedBooks(potentialBooks ?? [])

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
        <Group>
          <Search value={filter} onValueChange={onFilterChange} />
          <Sort value={sort} onValueChange={onSortChange} />
        </Group>
        <BookGrid
          className="flex-grow overflow-y-auto"
          books={books}
          isSelecting
          selected={selected}
          onSelect={(bookUuid) => {
            setSelected((prev) => {
              const next = new Set(prev)
              if (selected.has(bookUuid)) {
                next.delete(bookUuid)
              } else {
                next.add(bookUuid)
              }
              return next
            })
          }}
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
