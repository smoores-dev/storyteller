"use client"

import { useApiClient } from "@/hooks/useApiClient"
import { useRef, useState } from "react"
import { useForm } from "@mantine/form"
import { Button, Group, Stack, TextInput } from "@mantine/core"
import { DateInput } from "@mantine/dates"
import { AuthorRelation, SeriesRelation } from "@/database/books"
import { Status } from "@/database/statuses"
import { UUID } from "@/uuid"
import { useBook } from "../LiveBooksProvider"
import { Author } from "@/database/authors"
import { Series } from "@/database/series"
import { StatusInput } from "./StatusInput"
import { CoverImageInput } from "./CoverImageInput"
import { AuthorsInput } from "./AuthorsInput"
import { SeriesInput } from "./SeriesInput"
import { Collection } from "@/database/collections"
import { CollectionsInput } from "./CollectionsInput"
import { User } from "@/apiModels"
import { SaveState } from "@/components/forms"
import { useCurrentUser } from "@/contexts/UserPermissions"
import { TagsInput } from "./TagsInput"
import { Tag } from "@/database/tags"

type Props = {
  bookUuid: UUID
  authors: Author[]
  statuses: Status[]
  series: Series[]
  collections: Collection[]
  users: User[]
  tags: Tag[]
}

export function BookEditForm({
  bookUuid,
  statuses,
  authors,
  series,
  collections: initialCollections,
  users,
  tags,
}: Props) {
  const client = useApiClient()
  const currentUser = useCurrentUser()
  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [collections, setCollections] = useState(initialCollections)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const book = useBook(bookUuid, (update) => {
    form.setValues({
      title: update.title,
      language: update.language ?? "",
      authors: update.authors,
      series: update.series,
      statusUuid: update.statusUuid,
      collections: update.collections.map((collection) => collection.uuid),
      publicationDate:
        update.publicationDate && new Date(update.publicationDate),
      rating: update.rating,
      description: update.description ?? "",
      narrator: update.narrator ?? "",
      tags: update.tags.map((tag) => tag.name),
      textCover: null,
      audioCover: null,
    })
  })!

  const form = useForm({
    initialValues: {
      title: book.title,
      language: book.language ?? "",
      authors: book.authors as AuthorRelation[],
      series: book.series as SeriesRelation[],
      statusUuid: book.statusUuid,
      collections: book.collections.map((collection) => collection.uuid),
      publicationDate: book.publicationDate && new Date(book.publicationDate),
      rating: book.rating,
      description: book.description ?? "",
      narrator: book.narrator ?? "",
      tags: book.tags.map((tag) => tag.name),
      textCover: null as File | null,
      audioCover: null as File | null,
    },
  })

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
            await client.updateBook(
              {
                ...book,
                ...update,
                publicationDate:
                  update.publicationDate &&
                  update.publicationDate.toISOString(),
              },
              textCover,
              audioCover,
            )
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
            textCover={textCover}
            audioCover={audioCover}
            textFallback={client.getCoverUrl(book.uuid)}
            audioFallback={client.getCoverUrl(book.uuid)}
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
            />
            <DateInput
              label="Publication date"
              valueFormat="YYYY-MM-DD"
              {...form.getInputProps("publicationDate")}
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
                const newCollection = await client.createCollection(values)
                setCollections((collections) => [...collections, newCollection])
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
