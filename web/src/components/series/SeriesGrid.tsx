import {
  ActionIcon,
  Box,
  Button,
  Fieldset,
  Group,
  Image,
  List,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
  useModalsStack,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconTrash } from "@tabler/icons-react"
import Link from "next/link"
import { memo, useCallback, useEffect, useMemo, useState } from "react"

import { ContentEditable } from "@/components/books/edit/ContentEditable"
import { type BookWithRelations } from "@/database/books"
import { type SeriesWithBooks } from "@/hooks/useFilterSortedSeries"
import { usePermissions } from "@/hooks/usePermissions"
import {
  getCoverUrl,
  useDeleteSeriesMutation,
  useListBooksQuery,
  useUpdateSeriesMutation,
} from "@/store/api"

import { InlineBookSearch } from "./InlineBookSearch"
import { SeriesThumbnail } from "./SeriesThumbnail"

const EBOOK_COVER_OPTIONS = { height: 225, width: 147 } as const
const AUDIO_COVER_OPTIONS = { height: 147, width: 147, audio: true } as const

interface BookItemProps {
  book: {
    bookUuid: string
    position?: string | undefined
    featured?: boolean | undefined
    title: string
    index: number
  }
  bookData: BookWithRelations | undefined
  onPositionChange: (index: number, value: string) => void
  onRemove: (index: number) => void
}

const BookItem = memo(function BookItem({
  book,
  bookData,
  onPositionChange,
  onRemove,
}: BookItemProps) {
  const handlePositionChange = useCallback(
    (value: { value: string }) => {
      onPositionChange(book.index, value.value)
    },
    [book.index, onPositionChange],
  )

  const handleRemove = useCallback(() => {
    onRemove(book.index)
  }, [book.index, onRemove])

  if (!bookData) return null

  return (
    <Group key={book.bookUuid} className="flex-nowrap">
      <NumberInput
        className="w-14 shrink-0"
        // this makes the "up" arrow move the book "up" the series, which feels slightly more intuitive
        step={-1}
        classNames={{
          input: "pl-1 text-center bg-transparent",
        }}
        value={book.position ?? 0}
        onValueChange={handlePositionChange}
      />
      <Box className="h-10 w-8 shrink-0">
        <Image
          alt=""
          className="h-full rounded-md"
          aria-hidden
          src={
            bookData.ebook || bookData.readaloud
              ? getCoverUrl(book.bookUuid, EBOOK_COVER_OPTIONS)
              : getCoverUrl(book.bookUuid, AUDIO_COVER_OPTIONS)
          }
        />
      </Box>
      <Stack gap={0} className="grow">
        <Text>
          <Link
            href={`/books/${book.bookUuid}`}
            className="hover:text-st-orange-600 hover:underline"
          >
            {bookData.title}
          </Link>
        </Text>
        <Text size="xs">
          <Link
            href={`/books?authors=${bookData.authors[0]?.uuid}`}
            className="hover:text-st-orange-600 hover:underline"
          >
            {bookData.authors[0]?.name}
          </Link>
        </Text>
      </Stack>
      <ActionIcon
        variant="subtle"
        className="self-center"
        onClick={handleRemove}
      >
        <IconTrash color="red" />
      </ActionIcon>
    </Group>
  )
})

interface Props {
  series: SeriesWithBooks[]
}

export function SeriesGrid({ series }: Props) {
  const permissions = usePermissions()
  const { data: books } = useListBooksQuery()
  const bookMap = useMemo(
    () => new Map(books?.map((book) => [book.uuid, book])),
    [books],
  )

  const [selectedSeries, setSelectedSeries] = useState<SeriesWithBooks | null>(
    null,
  )

  const [updateSeries, { isLoading }] = useUpdateSeriesMutation()
  const [deleteSeries, { isLoading: isDeleteLoading }] =
    useDeleteSeriesMutation()

  const stack = useModalsStack(["delete", "update"])

  const form = useForm({
    initialValues: {
      name: selectedSeries?.name ?? "",
      description: selectedSeries?.name ?? "",
      relations:
        selectedSeries?.books.map((b) => ({
          ...b,
          position: b.position?.toString(),
        })) ?? [],
    },
  })

  const bookList = useMemo(
    () =>
      [
        ...form.values.relations.map((r, i) => ({
          ...r,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          title: bookMap.get(r.bookUuid)!.title,
          index: i,
        })),
      ].sort(
        (a, b) =>
          parseFloat(a.position?.toString() ?? "0") -
          parseFloat(b.position?.toString() ?? "0"),
      ),
    [bookMap, form.values.relations],
  )

  useEffect(() => {
    form.setValues({
      name: selectedSeries?.name ?? "",
      description: selectedSeries?.description ?? "",
      relations:
        selectedSeries?.books.map((b) => ({
          ...b,
          position: b.position?.toString(),
        })) ?? [],
    })
    // Form isn't a stable reference, but form.setFieldValue is, I guess?
  }, [selectedSeries]) // eslint-disable-line react-hooks/exhaustive-deps

  const changePosition = useCallback(
    (index: number, value: string) => {
      form.setFieldValue(`relations.${index}.position`, value)
    },
    [form],
  )

  return (
    <>
      {permissions?.bookUpdate ? (
        <>
          <Modal.Stack>
            <Modal
              {...stack.register("delete")}
              title="Deleting series"
              centered
              size="sm"
            >
              <Stack>
                <Text>
                  Are you sure you want to delete the series{" "}
                  <strong>{selectedSeries?.name}</strong>?
                </Text>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    await deleteSeries({
                      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      uuid: selectedSeries!.uuid,
                    })
                    stack.closeAll()
                  }}
                >
                  <Group justify="space-between">
                    <Button
                      variant="subtle"
                      disabled={isDeleteLoading}
                      onClick={() => {
                        stack.close("delete")
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      color="red"
                      disabled={isDeleteLoading}
                    >
                      Delete
                    </Button>
                  </Group>
                </form>
              </Stack>
            </Modal>
            <Modal
              {...stack.register("update")}
              onClose={() => {
                form.reset()
                setSelectedSeries(null)
                stack.closeAll()
              }}
              title="Add books to series"
              centered
              size="lg"
            >
              <form
                className="flex flex-col gap-4"
                onSubmit={form.onSubmit(async (values) => {
                  await updateSeries({
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    uuid: selectedSeries!.uuid,
                    update: {
                      name: values.name,
                      description: values.description,
                      relations: values.relations.map((r) => ({
                        ...r,
                        position:
                          r.position != null ? parseFloat(r.position) : null,
                      })),
                    },
                  })

                  form.reset()
                  setSelectedSeries(null)
                  stack.closeAll()
                })}
              >
                <Stack gap={4} className="my-4">
                  <TextInput label="Name" {...form.getInputProps("name")} />
                  <ContentEditable
                    label="Description"
                    {...form.getInputProps("description")}
                    value={form.values.description}
                  />
                  <Fieldset legend="Books">
                    <Stack className="gap-4">
                      {bookList.map((book) => (
                        <BookItem
                          book={book}
                          bookData={bookMap.get(book.bookUuid)}
                          onPositionChange={changePosition}
                          onRemove={() => {
                            form.removeListItem("relations", book.index)
                          }}
                          key={book.bookUuid}
                        />
                      ))}
                      <InlineBookSearch
                        booksToExclude={bookList.map((b) => b.bookUuid)}
                        onValueChange={(book) => {
                          const last = bookList.at(-1)
                          const relation = {
                            bookUuid: book.uuid,
                            featured: last ? last.featured : true,
                            position:
                              last?.position != null
                                ? Math.floor(parseFloat(last.position)) + 1
                                : 1,
                          }
                          form.insertListItem("relations", {
                            ...relation,
                            position: relation.position.toString(),
                          })
                          setSelectedSeries(
                            (s) =>
                              s && {
                                ...s,
                                books: [...s.books, relation],
                              },
                          )
                        }}
                      />
                    </Stack>
                  </Fieldset>
                </Stack>
                <Group className="justify-between">
                  <Button
                    color="red"
                    variant="outline"
                    disabled={isLoading}
                    onClick={() => {
                      stack.open("delete")
                    }}
                  >
                    Delete
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Saving…" : "Save"}
                  </Button>
                </Group>
              </form>
            </Modal>
          </Modal.Stack>
        </>
      ) : (
        <>
          <Modal
            {...stack.register("update")}
            onClose={() => {
              form.reset()
              setSelectedSeries(null)
              stack.closeAll()
            }}
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            title={selectedSeries?.name}
            centered
            size="lg"
          >
            <Stack gap={4} className="my-4">
              {selectedSeries?.description && (
                <div
                  dangerouslySetInnerHTML={{
                    __html: selectedSeries.description,
                  }}
                />
              )}
              <Stack className="gap-4">
                {bookList.map((book) => (
                  <Group key={book.uuid} flex="nowrap">
                    <Box>{book.position}</Box>
                    <Box className="h-10 w-8 shrink-0">
                      <Image
                        alt=""
                        className="h-full rounded-md"
                        aria-hidden
                        src={
                          bookMap.get(book.bookUuid)?.ebook ||
                          bookMap.get(book.bookUuid)?.readaloud
                            ? getCoverUrl(book.bookUuid, EBOOK_COVER_OPTIONS)
                            : getCoverUrl(book.bookUuid, AUDIO_COVER_OPTIONS)
                        }
                      />
                    </Box>
                    <Stack gap={0} className="grow">
                      <Text>
                        <Link
                          href={`/books/${book.bookUuid}`}
                          className="hover:text-st-orange-600 hover:underline"
                        >
                          {book.title}
                        </Link>
                      </Text>
                      <Text size="xs">
                        <Link
                          href={`/books?authors=${bookMap.get(book.bookUuid)?.authors[0]?.uuid}`}
                          className="hover:text-st-orange-600 hover:underline"
                        >
                          {bookMap.get(book.bookUuid)?.authors[0]?.name}
                        </Link>
                      </Text>
                    </Stack>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </Modal>
        </>
      )}
      <Text className="mt-4 text-sm">
        {series.length} series (
        {series.reduce((acc, s) => s.books.length + acc, 0)} books)
      </Text>
      <List
        listStyleType="none"
        className={"relative z-10 flex flex-row flex-wrap gap-6"}
      >
        {series.map((s, index) => (
          <List.Item
            style={{ zIndex: series.length - index }}
            key={s.uuid}
            classNames={{ itemWrapper: "block" }}
          >
            <SeriesThumbnail
              series={s}
              onClick={() => {
                setSelectedSeries(s)
                stack.open("update")
              }}
            />
          </List.Item>
        ))}
      </List>
    </>
  )
}
