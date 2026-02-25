import {
  Button,
  Group,
  MenuItem,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core"
import { DateInput } from "@mantine/dates"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { IconArrowMerge } from "@tabler/icons-react"
import { useEffect, useMemo } from "react"

import { BookThumbnailImage } from "@/components/books/BookThumbnailImage"
import { AuthorsInput } from "@/components/books/edit/AuthorsInput"
import { CollectionsInput } from "@/components/books/edit/CollectionsInput"
import { CreatorsInput } from "@/components/books/edit/CreatorsInput"
import { NarratorsInput } from "@/components/books/edit/NarratorsInput"
import { SeriesInput } from "@/components/books/edit/SeriesInput"
import { StatusInput } from "@/components/books/edit/StatusInput"
import { TagsInput } from "@/components/books/edit/TagsInput"
import {
  type BookWithRelations,
  type CreatorRelation,
  type SeriesRelation,
} from "@/database/books"
import {
  useGetCurrentUserQuery,
  useListBooksQuery,
  useListCollectionsQuery,
  useListCreatorsQuery,
  useListSeriesQuery,
  useListStatusesQuery,
  useListTagsQuery,
  useMergeBooksMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

const EMPTY_BOOKS: BookWithRelations[] = []

interface Props {
  selected: Set<UUID>
  onCommit: () => void
}

export function MergeBooksItem({ selected, onCommit }: Props) {
  const [isOpen, { open, close }] = useDisclosure()

  const { data: currentUser } = useGetCurrentUserQuery()
  const [mergeBooks] = useMergeBooksMutation()

  const { data: allBooks = EMPTY_BOOKS } = useListBooksQuery()

  const books = useMemo(
    () => allBooks.filter((book) => selected.has(book.uuid)),
    [allBooks, selected],
  )

  const { data: collections = [] } = useListCollectionsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const { data: tags = [] } = useListTagsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const { data: statuses = [] } = useListStatusesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const { data: series = [] } = useListSeriesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  const { data: creators = [] } = useListCreatorsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })

  const disabled = useMemo(() => {
    if (selected.size > 3) return true

    const counts = {
      readaloud: 0,
      ebook: 0,
      audiobook: 0,
    }

    for (const book of books) {
      if (book.ebook) counts.ebook++
      if (book.audiobook) counts.audiobook++
      if (book.readaloud) counts.readaloud++
    }

    return counts.readaloud > 1 || counts.ebook > 1 || counts.audiobook > 1
  }, [books, selected.size])

  const readaloud = books.find((book) => book.readaloud)
  const ebook = books.find((book) => book.ebook)
  const audiobook = books.find((book) => book.audiobook)

  const initialCollections = useMemo(
    () =>
      Array.from(
        new Set(
          books
            .flatMap((book) => book.collections)
            .map((collection) => collection.uuid),
        ),
      ),
    [books],
  )

  const initialTags = useMemo(
    () =>
      Array.from(
        new Set(books.flatMap((book) => book.tags).map((tag) => tag.name)),
      ),
    [books],
  )

  const initialPublicationDate =
    readaloud?.publicationDate ||
    ebook?.publicationDate ||
    audiobook?.publicationDate

  const form = useForm({
    initialValues: {
      title: readaloud?.title || ebook?.title || audiobook?.title || "",
      language:
        (readaloud?.language || ebook?.language || audiobook?.language) ?? null,
      authors: (
        readaloud?.authors ??
        ebook?.authors ??
        audiobook?.authors ??
        ([] as CreatorRelation[])
      ).map((author) => author.name),
      creators:
        readaloud?.creators ??
        ebook?.creators ??
        audiobook?.creators ??
        ([] as CreatorRelation[]),
      series:
        readaloud?.series ??
        ebook?.series ??
        audiobook?.series ??
        ([] as SeriesRelation[]),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      statusUuid: (readaloud?.status?.uuid ??
        ebook?.status?.uuid ??
        audiobook?.status?.uuid)!,
      collections: initialCollections,
      publicationDate: initialPublicationDate
        ? new Date(initialPublicationDate)
        : null,
      rating: (readaloud?.rating || ebook?.rating || audiobook?.rating) ?? null,
      description:
        (readaloud?.description ||
          ebook?.description ||
          audiobook?.description) ??
        null,
      narrators: (
        audiobook?.narrators ??
        readaloud?.narrators ??
        ebook?.narrators ??
        ([] as CreatorRelation[])
      ).map((author) => author.name),
      tags: initialTags,
    },
  })

  // v to make the eslint-disable-line comment stay in the correct place
  // prettier-ignore
  useEffect(() => {
    form.setValues({
      title: readaloud?.title || ebook?.title || audiobook?.title || "",
      language:
        (readaloud?.language || ebook?.language || audiobook?.language) ?? null,
      authors: (
        readaloud?.authors ??
        ebook?.authors ??
        audiobook?.authors ??
        ([] as CreatorRelation[])
      ).map((author) => author.name),
      creators:
        readaloud?.creators ??
        ebook?.creators ??
        audiobook?.creators ??
        ([] as CreatorRelation[]),
      series:
        readaloud?.series ??
        ebook?.series ??
        audiobook?.series ??
        ([] as SeriesRelation[]),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      statusUuid: (readaloud?.status?.uuid ??
        ebook?.status?.uuid ??
        audiobook?.status?.uuid)!,
      collections: initialCollections,
      publicationDate: initialPublicationDate
        ? new Date(initialPublicationDate)
        : null,
      rating: (readaloud?.rating || ebook?.rating || audiobook?.rating) ?? null,
      description:
        (readaloud?.description ||
          ebook?.description ||
          audiobook?.description) ??
        null,
      narrators: (
        audiobook?.narrators ??
        readaloud?.narrators ??
        ebook?.narrators ??
        ([] as CreatorRelation[])
      ).map((narrator) => narrator.name),
      tags: initialTags,
    })
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    // Form isn't a stable reference, but form.setValues is, I guess?
    audiobook?.authors,
    audiobook?.creators,
    audiobook?.description,
    audiobook?.language,
    audiobook?.narrators,
    audiobook?.rating,
    audiobook?.series,
    audiobook?.status?.uuid,
    audiobook?.title,
    ebook?.authors,
    ebook?.creators,
    ebook?.description,
    ebook?.language,
    ebook?.narrators,
    ebook?.rating,
    ebook?.series,
    ebook?.status?.uuid,
    ebook?.title,
    initialCollections,
    initialPublicationDate,
    initialTags,
    readaloud?.authors,
    readaloud?.creators,
    readaloud?.description,
    readaloud?.language,
    readaloud?.narrators,
    readaloud?.rating,
    readaloud?.series,
    readaloud?.status?.uuid,
    readaloud?.title,
  ])

  const {
    creators: bookCreators,
    series: bookSeries,
    collections: bookCollections,
    statusUuid,
  } = form.values

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={() => {
          close()
        }}
        title="Merge books"
        centered
      >
        <Stack gap={32}>
          <Group className="justify-center">
            {books.map((book) => (
              <BookThumbnailImage
                key={book.uuid}
                book={book}
                height="10rem"
                width="6.53125rem"
              />
            ))}
          </Group>
          <Text>Select which metadata you’d like to keep from each book.</Text>
          <form
            onSubmit={form.onSubmit(async (values) => {
              onCommit()

              const {
                authors,
                creators,
                narrators,
                series,
                collections,
                tags,
                publicationDate,
                statusUuid,
                ...update
              } = values
              await mergeBooks({
                update: {
                  ...update,
                  publicationDate:
                    publicationDate && new Date(publicationDate).toISOString(),
                },
                relations: {
                  creators: [
                    ...creators,
                    ...authors.map((name) => ({
                      name,
                      fileAs: name,
                      role: "aut" as const,
                    })),
                    ...narrators.map((name) => ({
                      name,
                      fileAs: name,
                      role: "nrt" as const,
                    })),
                  ],
                  ...(currentUser && {
                    // TODO: This should probably be set in the backend,
                    // not the frontend
                    status: { statusUuid, userId: currentUser.id },
                  }),
                  series,
                  collections,
                  tags,
                },
                from: Array.from(selected),
              })
            })}
          >
            <Stack gap={16}>
              <StatusInput
                value={statusUuid}
                onChange={(value) => {
                  form.setFieldValue("statusUuid", value)
                }}
                options={statuses}
              />
              <Stack gap={4}>
                <TextInput
                  className="m-0"
                  label="Title"
                  {...form.getInputProps("title")}
                />
                {books
                  .filter((book) => book.title)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue("title", book.title)
                      }}
                    >
                      {book.title}
                    </Button>
                  ))}
              </Stack>
              <Stack gap={4}>
                <TagsInput tags={tags} {...form.getInputProps("tags")} />
                {books
                  .filter((book) => book.tags.length)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue(
                          "tags",
                          book.tags.map((tag) => tag.name),
                        )
                      }}
                    >
                      {book.tags.map((tag) => tag.name).join(", ")}
                    </Button>
                  ))}
              </Stack>
              <Stack gap={4}>
                <TextInput
                  className="m-0"
                  label="Language"
                  {...form.getInputProps("language")}
                  value={form.values.language ?? ""}
                />
                {books
                  .filter((book) => book.language)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue("language", book.language)
                      }}
                    >
                      {book.language}
                    </Button>
                  ))}
              </Stack>
              <Stack gap={4}>
                <DateInput
                  label="Publication date"
                  valueFormat="YYYY-MM-DD"
                  {...form.getInputProps("publicationDate")}
                />
                {books
                  .filter((book) => book.publicationDate)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue(
                          "publicationDate",
                          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                          new Date(book.publicationDate!),
                        )
                      }}
                    >
                      {book.publicationDate}
                    </Button>
                  ))}
              </Stack>
              <Stack gap={4}>
                <NarratorsInput
                  narrators={creators}
                  {...form.getInputProps("narrators")}
                />
                {books
                  .filter((book) => book.narrators.length)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue(
                          "narrators",
                          book.narrators.map((narrator) => narrator.name),
                        )
                      }}
                    >
                      {book.narrators
                        .map((narrator) => narrator.name)
                        .join(", ")}
                    </Button>
                  ))}
              </Stack>
              <Stack gap={4}>
                <Textarea
                  className="m-0"
                  label="Description"
                  {...form.getInputProps("description")}
                  value={form.values.description ?? ""}
                />
                {books
                  .filter((book) => book.description)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue("description", book.description)
                      }}
                    >
                      {book.description}
                    </Button>
                  ))}
              </Stack>
              <Stack gap={4}>
                <AuthorsInput
                  authors={creators}
                  {...form.getInputProps("authors")}
                />
                {books
                  .filter((book) => book.authors.length)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue(
                          "authors",
                          book.authors.map((author) => author.name),
                        )
                      }}
                    >
                      {book.authors.map((authors) => authors.name).join(", ")}
                    </Button>
                  ))}
              </Stack>
              <Stack gap={4}>
                <CreatorsInput
                  values={bookCreators}
                  getInputProps={form.getInputProps}
                  removeCreator={(i) => {
                    form.removeListItem("creators", i)
                  }}
                  addCreator={(creator) => {
                    form.insertListItem("creators", creator)
                  }}
                  creators={creators}
                />
                {books
                  .filter((book) => book.authors.length)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue("creators", book.creators)
                      }}
                    >
                      {book.creators.map((author) => author.name).join(", ")}
                    </Button>
                  ))}
              </Stack>
              <Stack gap={4}>
                <SeriesInput
                  values={bookSeries}
                  getInputProps={form.getInputProps}
                  removeSeries={(i) => {
                    form.removeListItem("series", i)
                  }}
                  addSeries={(series) => {
                    form.insertListItem("series", series)
                  }}
                  series={series}
                />
                {books
                  .filter((book) => book.series.length)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue("series", book.series)
                      }}
                    >
                      {book.series.map((s) => s.name).join(", ")}
                    </Button>
                  ))}
              </Stack>
              <Stack gap={4}>
                <CollectionsInput
                  values={bookCollections}
                  collections={collections}
                  getInputProps={form.getInputProps}
                />
                {books
                  .filter((book) => book.collections.length)
                  .map((book) => (
                    <Button
                      key={book.uuid}
                      variant="outline"
                      className="border-gray-200 bg-gray-100 font-normal text-gray-800"
                      classNames={{
                        inner: "justify-start",
                      }}
                      onClick={() => {
                        form.setFieldValue(
                          "collections",
                          book.collections.map((collection) => collection.uuid),
                        )
                      }}
                    >
                      {book.collections
                        .map((collection) => collection.name)
                        .join(", ")}
                    </Button>
                  ))}
              </Stack>
              <Button type="submit" className="self-end">
                Merge
              </Button>
            </Stack>
          </form>
        </Stack>
      </Modal>
      <MenuItem
        leftSection={<IconArrowMerge size={14} />}
        onClick={() => {
          open()
        }}
        disabled={disabled}
      >
        Merge books
      </MenuItem>
    </>
  )
}
