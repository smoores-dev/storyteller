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
              Are you sure you want to delete the collection{" "}
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
                  {form.values.relations.map((book, index) => (
                    <Group key={book.bookUuid}>
                      <TextInput
                        className="w-10"
                        classNames={{
                          input: "p-0 text-center bg-transparent",
                        }}
                        {...form.getInputProps(`relations.${index}.position`)}
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
                        <Text>{bookMap.get(book.bookUuid)?.title}</Text>
                        <Text size="xs">
                          {bookMap.get(book.bookUuid)?.authors[0]?.name}
                        </Text>
                      </Stack>
                      <ActionIcon
                        variant="subtle"
                        className="self-center"
                        onClick={() => {
                          form.removeListItem("relations", index)
                        }}
                      >
                        <IconTrash color="red" />
                      </ActionIcon>
                    </Group>
                  ))}
                  <InlineBookSearch
                    onValueChange={(book) => {
                      const last = form.values.relations.at(-1)
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
