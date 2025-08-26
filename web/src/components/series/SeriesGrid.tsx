import { SeriesWithBooks } from "@/hooks/useFilterSortedSeries"
import { SeriesThumbnail } from "./SeriesThumbnail"
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
import { useEffect, useMemo, useState } from "react"
import {
  getCoverUrl,
  useDeleteSeriesMutation,
  useListBooksQuery,
  useUpdateSeriesMutation,
} from "@/store/api"
import { ContentEditable } from "../books/edit/ContentEditable"
import { IconTrash } from "@tabler/icons-react"
import { InlineBookSearch } from "./InlineBookSearch"
import Link from "next/link"

interface Props {
  series: SeriesWithBooks[]
}

export function SeriesGrid({ series }: Props) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeries])

  return (
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
                <Button type="submit" color="red" disabled={isDeleteLoading}>
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
                    <Group key={book.bookUuid}>
                      <NumberInput
                        className="w-14"
                        // this makes the "up" arrow move the book "up" the series, which feels slightly more intuitive
                        step={-1}
                        classNames={{
                          input: "pl-1 text-center bg-transparent",
                        }}
                        {...form.getInputProps(
                          `relations.${book.index}.position`,
                        )}
                        onValueChange={(value) => {
                          const currentPosition = parseFloat(
                            book.position?.toString() ?? "0",
                          )
                          const newPosition = value.floatValue

                          if (newPosition === currentPosition || !newPosition) {
                            return
                          }

                          const relations = [...form.values.relations]
                          const isMovingUp = newPosition < currentPosition

                          if (isMovingUp) {
                            // increment positions of books at or above target position
                            relations.forEach((relation, index) => {
                              if (index === book.index) return

                              const relationPosition = parseFloat(
                                relation.position?.toString() ?? "0",
                              )
                              if (
                                relationPosition >= newPosition &&
                                relationPosition < currentPosition
                              ) {
                                form.setFieldValue(
                                  `relations.${index}.position`,
                                  (relationPosition + 1).toString(),
                                )
                              }
                            })
                          } else {
                            // decrement positions of books between current and target
                            relations.forEach((relation, index) => {
                              if (index === book.index) return

                              const relationPosition = parseFloat(
                                relation.position?.toString() ?? "0",
                              )
                              if (
                                relationPosition > currentPosition &&
                                relationPosition <= newPosition
                              ) {
                                form.setFieldValue(
                                  `relations.${index}.position`,
                                  (relationPosition - 1).toString(),
                                )
                              }
                            })
                          }

                          form.setFieldValue(
                            `relations.${book.index}.position`,
                            newPosition.toString(),
                          )
                        }}
                      />
                      <Box className="h-10 w-8">
                        <Image
                          alt=""
                          className="h-full rounded-md"
                          aria-hidden
                          src={
                            bookMap.get(book.bookUuid)?.ebook ||
                            bookMap.get(book.bookUuid)?.readaloud
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
                      <Stack gap={0} className="grow">
                        <Text>
                          <Link
                            href={`/books/${book.bookUuid}`}
                            className="hover:text-st-orange-600 hover:underline"
                          >
                            {bookMap.get(book.bookUuid)?.title}
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
                      <ActionIcon
                        variant="subtle"
                        className="self-center"
                        onClick={() => {
                          form.removeListItem("relations", book.index)
                        }}
                      >
                        <IconTrash color="red" />
                      </ActionIcon>
                    </Group>
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
