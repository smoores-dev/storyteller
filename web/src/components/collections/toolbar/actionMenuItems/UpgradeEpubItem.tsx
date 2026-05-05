import { MenuItem } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { IconFileArrowRight } from "@tabler/icons-react"

import { UpgradeEpubModal } from "@/components/books/modals/UpgradeEpubModal"
import { type BookWithRelations } from "@/database/books"
import { useListBooksQuery } from "@/store/api"
import { type UUID } from "@/uuid"

const EMPTY_BOOKS: BookWithRelations[] = []

interface Props {
  selected: Set<UUID>
  onCommit: () => void
}

export function UpgradeEpubItem({ selected, onCommit }: Props) {
  const [isOpen, { open, close }] = useDisclosure()

  const { books } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      books:
        result.data?.filter((book) => selected.has(book.uuid)) ?? EMPTY_BOOKS,
    }),
  })

  const booksWithEpubs = books.filter(
    (book) =>
      book.ebook?.filepath.endsWith(".epub") ||
      book.readaloud?.filepath?.endsWith(".epub"),
  )

  if (booksWithEpubs.length === 0) return null

  return (
    <>
      <UpgradeEpubModal
        bookUuids={booksWithEpubs.map((b) => b.uuid)}
        isOpen={isOpen}
        onClose={() => {
          close()
          onCommit()
        }}
      />

      <MenuItem leftSection={<IconFileArrowRight size={14} />} onClick={open}>
        Convert to EPUB 3
      </MenuItem>
    </>
  )
}
