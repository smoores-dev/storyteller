"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { useForm } from "@mantine/form"
import { Button, Group, Stack, TextInput } from "@mantine/core"
import { DateInput } from "@mantine/dates"
import { AuthorRelation, SeriesRelation } from "@/database/books"
import { StatusInput } from "./StatusInput"
import { CoverImageInput } from "./CoverImageInput"
import { AuthorsInput } from "./AuthorsInput"
import { SeriesInput } from "./SeriesInput"
import { CollectionsInput } from "./CollectionsInput"
import { SaveState } from "@/components/forms"
import { TagsInput } from "./TagsInput"
import {
  getCoverUrl,
  useCreateCollectionMutation,
  useGetCurrentUserQuery,
  useListAuthorsQuery,
  useListCollectionsQuery,
  useListSeriesQuery,
  useListStatusesQuery,
  useListTagsQuery,
  useListUsersQuery,
  useUpdateBookMutation,
} from "@/store/api"
import { BookDetail } from "@/apiModels"
import { ContentEditable } from "./ContentEditable"

type Props = {
  book: BookDetail
}

export function BookEditForm({ book }: Props) {
  const { data: currentUser } = useGetCurrentUserQuery()

  const [createCollection] = useCreateCollectionMutation()
  const [updateBook] = useUpdateBookMutation()

  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { data: collections = [] } = useListCollectionsQuery()
  const { data: tags = [] } = useListTagsQuery()
  const { data: statuses = [] } = useListStatusesQuery()
  const { data: series = [] } = useListSeriesQuery()
  const { data: authors = [] } = useListAuthorsQuery()
  const { data: users = [] } = useListUsersQuery()

  // useInitialData(api.util.upsertQueryData(''))

  // const { book } = useListBooksQuery(undefined, {
  //   selectFromResult: (result) => ({
  //     book: result.data?.find((b) => b.uuid === bookUuid),
  //   }),
  // })

  const form = useForm({
    initialValues: {
      title: book.title,
      language: book.language,
      authors: book.authors as AuthorRelation[],
      series: book.series as SeriesRelation[],
      statusUuid: book.statusUuid,
      collections: book.collections.map((collection) => collection.uuid),
      publicationDate: book.publicationDate && new Date(book.publicationDate),
      rating: book.rating,
      description: book.description,
      narrator: book.narrator,
      tags: book.tags.map((tag) => tag.name),
      textCover: null as File | null,
      audioCover: null as File | null,
    },
  })

  useLayoutEffect(() => {
    form.initialize({
      title: book.title,
      language: book.language,
      authors: book.authors as AuthorRelation[],
      series: book.series as SeriesRelation[],
      statusUuid: book.statusUuid,
      collections: book.collections.map((collection) => collection.uuid),
      publicationDate: book.publicationDate && new Date(book.publicationDate),
      rating: book.rating,
      description: book.description,
      narrator: book.narrator,
      tags: book.tags.map((tag) => tag.name),
      textCover: null as File | null,
      audioCover: null as File | null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book])

  const {
    textCover,
    audioCover,
    authors: bookAuthors,
    series: bookSeries,
    collections: bookCollections,
    statusUuid,
  } = form.values

  const [savedState, setSavedState] = useState<SaveState>(SaveState.CLEAN)

  return (
    <>
      {savedState === SaveState.ERROR && (
        <p>Failed to update. Check your server logs for details.</p>
      )}
      <form
        onSubmit={form.onSubmit(async (values) => {
          setSavedState(SaveState.LOADING)
          const { textCover, audioCover, ...update } = values
          try {
            await updateBook({
              update: {
                ...book,
                ...update,
                publicationDate:
                  update.publicationDate &&
                  update.publicationDate.toISOString(),
              },
              textCover,
              audioCover,
            })
          } catch (_) {
            setSavedState(SaveState.ERROR)
            return
          }

          setSavedState(SaveState.SAVED)

          if (clearSavedTimeoutRef.current) {
            clearTimeout(clearSavedTimeoutRef.current)
          }
          clearSavedTimeoutRef.current = setTimeout(() => {
            setSavedState(SaveState.CLEAN)
          }, 2000)
        })}
      >
        <StatusInput
          value={statusUuid}
          onChange={(value) => {
            form.setFieldValue("statusUuid", value)
          }}
          options={statuses}
        />
        <Group align="stretch" gap="xl" mt="lg">
          <CoverImageInput
            mediaType={
              (book.ebook && book.audiobook) || book.readaloud
                ? "both"
                : book.ebook
                  ? "ebook"
                  : "audiobook"
            }
            textCover={textCover}
            audioCover={audioCover}
            textFallback={getCoverUrl(book.uuid)}
            audioFallback={getCoverUrl(book.uuid, true)}
            getInputProps={form.getInputProps}
          />
          <Stack gap={32} className="grow">
            <TextInput
              className="m-0"
              label="Title"
              {...form.getInputProps("title")}
            />
            <TagsInput tags={tags} {...form.getInputProps("tags")} />
            <TextInput
              className="m-0"
              label="Language"
              {...form.getInputProps("language")}
              value={form.values.language ?? ""}
            />
            <DateInput
              label="Publication date"
              valueFormat="YYYY-MM-DD"
              {...form.getInputProps("publicationDate")}
            />
            <TextInput
              className="m-0"
              label="Narrator"
              {...form.getInputProps("narrator")}
              value={form.values.narrator ?? ""}
            />
            <ContentEditable
              className="m-0"
              label="Description"
              {...form.getInputProps("description")}
              value={form.values.description}
            />
            <AuthorsInput
              values={bookAuthors}
              getInputProps={form.getInputProps}
              removeAuthor={(i) => {
                form.removeListItem("authors", i)
              }}
              addAuthor={(author) => {
                form.insertListItem("authors", author)
              }}
              authors={authors}
            />
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
            <CollectionsInput
              values={bookCollections}
              collections={collections}
              users={users}
              getInputProps={form.getInputProps}
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
          </Stack>
        </Group>

        <Group justify="flex-end" className="sticky bottom-0 z-10 bg-white p-6">
          <Button type="submit" disabled={savedState === SaveState.LOADING}>
            {savedState === SaveState.SAVED ? "Saved!" : "Update"}
          </Button>
        </Group>
      </form>
    </>
  )
}
