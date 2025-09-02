import {
  Autocomplete,
  Box,
  Button,
  Fieldset,
  Group,
  Image,
  MenuItem,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconBook } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"

import { type BookWithRelations } from "@/database/books"
import { type NewSeries } from "@/database/series"
import {
  getCoverUrl,
  useAddBooksToSeriesMutation,
  useListBooksQuery,
  useListSeriesQuery,
} from "@/store/api"
import { type UUID } from "@/uuid"

interface Props {
  selected: Set<UUID>
}

const EMPTY_BOOKS: BookWithRelations[] = []

export function AddBooksToSeriesItem({ selected }: Props) {
  const [addBooksToSeries, { isLoading }] = useAddBooksToSeriesMutation()

  const { data: series = [], refetch } = useListSeriesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })

  const { data: books = EMPTY_BOOKS } = useListBooksQuery()

  const selectedBooks = useMemo(
    () => books.filter((book) => selected.has(book.uuid)),
    [books, selected],
  )

  const [isOpen, setIsOpen] = useState(false)

  const form = useForm({
    initialValues: {
      series: null as NewSeries | null,
      relations: selectedBooks.map((book, i) => ({
        bookUuid: book.uuid,
        position: (i + 1).toString(),
        featured: !book.series.length,
      })),
    },
  })

  useEffect(() => {
    form.setFieldValue(
      "relations",
      selectedBooks.map((book, i) => ({
        bookUuid: book.uuid,
        position: (i + 1).toString(),
        featured: !book.series.length,
      })),
    )
    // Form isn't a stable reference, but form.setFieldValue is, I guess?
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBooks])

  const { series: newSeries, relations } = form.values

  const { seriesBooks } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      seriesBooks:
        result.data?.filter((book) =>
          book.series.some((s) => s.uuid === newSeries?.uuid),
        ) ?? EMPTY_BOOKS,
    }),
  })

  const bookList = useMemo(
    () =>
      [
        ...relations.map((r, i) => ({
          type: "relation" as const,
          ...r,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          title: books.find((b) => b.uuid === r.bookUuid)!.title,
          index: i,
        })),
        ...seriesBooks.map((b) => ({
          type: "seriesBook" as const,
          bookUuid: b.uuid,
          title: b.title,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          position: b.series.find((s) => s.uuid === newSeries!.uuid)!.position,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          featured: b.series.find((s) => s.uuid === newSeries!.uuid)!.featured,
        })),
      ].sort(
        (a, b) =>
          parseFloat(a.position?.toString() ?? "0") -
          parseFloat(b.position?.toString() ?? "0"),
      ),
    [books, newSeries, relations, seriesBooks],
  )

  const seriesWithoutSelectedBooks = useMemo(
    () =>
      series.filter(
        (s) =>
          !selectedBooks.some((b) => b.series.some((bs) => bs.uuid === s.uuid)),
      ),
    [series, selectedBooks],
  )

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={() => {
          form.reset()
          setIsOpen(false)
        }}
        title="Add books to series"
        centered
        size="lg"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.onSubmit(async (values) => {
            if (!values.series) return

            await addBooksToSeries({
              series: values.series,
              relations: values.relations.map((r) => ({
                ...r,
                position: parseFloat(r.position),
              })),
            })

            await refetch()

            form.reset()
            setIsOpen(false)
          })}
        >
          <Stack gap={4} className="my-4">
            <Autocomplete
              label="Series"
              data={seriesWithoutSelectedBooks.map((s) => s.name)}
              {...form.getInputProps(`series.name`)}
              value={newSeries?.name ?? ""}
              onChange={(name) => {
                const newSeries = seriesWithoutSelectedBooks.find(
                  (s) => s.name === name,
                )
                form.setFieldValue("series", newSeries ?? { name })
              }}
            />

            <Fieldset legend="Books">
              <Stack className="gap-4">
                {bookList.map((book) => (
                  <Group key={book.bookUuid} className="flex-nowrap">
                    {book.type === "relation" ? (
                      <TextInput
                        className="w-10 shrink-0"
                        classNames={{
                          input: "p-0 text-center bg-transparent",
                        }}
                        {...form.getInputProps(
                          `relations.${book.index}.position`,
                        )}
                      />
                    ) : (
                      <Text className="w-10 text-center text-xl">
                        #{book.position}
                      </Text>
                    )}

                    <Box className="h-10 w-8 shrink-0">
                      <Image
                        alt=""
                        className="h-full rounded-md"
                        aria-hidden
                        src={
                          books.find((b) => b.uuid === book.bookUuid)?.ebook ||
                          books.find((b) => b.uuid === book.bookUuid)?.readaloud
                            ? getCoverUrl(book.bookUuid, {
                                height: 225,
                                width: 147,
                              })
                            : getCoverUrl(book.bookUuid, {
                                height: 147,
                                width: 147,
                                audio: true,
                              })
                        }
                      ></Image>
                    </Box>
                    <Text>{book.title}</Text>
                  </Group>
                ))}
              </Stack>
            </Fieldset>
          </Stack>
          <Button type="submit" disabled={isLoading || !newSeries}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </form>
      </Modal>
      <MenuItem
        leftSection={<IconBook size={14} />}
        onClick={() => {
          setIsOpen(true)
        }}
      >
        Add to series
      </MenuItem>
    </>
  )
}
