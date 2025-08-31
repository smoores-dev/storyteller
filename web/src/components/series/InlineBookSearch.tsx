import { BookWithRelations } from "@/database/books"
import { getCoverUrl, useListBooksQuery } from "@/store/api"
import { UUID } from "@/uuid"
import {
  Box,
  Combobox,
  Group,
  Image,
  InputBase,
  Stack,
  Text,
  useCombobox,
} from "@mantine/core"
import { useMemo, useState } from "react"

interface Props {
  onValueChange: (book: BookWithRelations) => void
  /** Books to exclude from the series search results. Usually the books already in the series. */
  booksToExclude?: UUID[]
}

export function InlineBookSearch({ onValueChange, booksToExclude }: Props) {
  const { data: books } = useListBooksQuery()

  const [search, setSearch] = useState("")

  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
    },
  })

  const filteredBookOptions = useMemo(() => {
    return books
      ?.filter(
        (book) =>
          !booksToExclude?.includes(book.uuid) &&
          (book.title.toLowerCase().includes(search.toLowerCase()) ||
            book.authors
              .map(({ name }) => name)
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase())),
      )
      .map((book) => (
        <Combobox.Option value={book.uuid} key={book.uuid}>
          <BookItem book={book} />
        </Combobox.Option>
      ))
  }, [books, booksToExclude, search])

  return (
    <Combobox
      store={combobox}
      // withinPortal={false}
      onOptionSubmit={(submitted) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        onValueChange(books!.find((book) => book.uuid === submitted)!)
        combobox.closeDropdown()
      }}
    >
      <Combobox.Target>
        <InputBase
          rightSection={<Combobox.Chevron />}
          onFocus={() => {
            combobox.toggleDropdown()
          }}
          rightSectionPointerEvents="none"
          placeholder="Add a book"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value)
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>{filteredBookOptions}</Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}

function BookItem({ book }: { book: BookWithRelations }) {
  return (
    <Group>
      <Box className="h-10 w-8">
        <Image
          alt=""
          className="h-full rounded-md"
          aria-hidden
          src={getCoverUrl(book.uuid, {
            height: 40,
            width: 32,
          })}
        ></Image>
      </Box>
      <Stack gap={0} className="grow">
        <Text>{book.title}</Text>
        <Text size="xs">{book.authors[0]?.name}</Text>
      </Stack>
    </Group>
  )
}
