"use client"

import { useRef, useState } from "react"
import { useForm } from "@mantine/form"
import { Button, Group, px, Stack, TextInput } from "@mantine/core"
import { DateInput } from "@mantine/dates"
import { CreatorRelation, SeriesRelation } from "@/database/books"
import { StatusInput } from "./StatusInput"
import { CoverImageInput } from "./CoverImageInput"
import { AuthorsInput } from "./AuthorsInput"
import { SeriesInput } from "./SeriesInput"
import { CollectionsInput } from "./CollectionsInput"
import { SaveState } from "@/components/forms"
import { TagsInput } from "./TagsInput"
import {
  getCoverUrl,
  useListCreatorsQuery,
  useListCollectionsQuery,
  useListSeriesQuery,
  useListStatusesQuery,
  useListTagsQuery,
  useUpdateBookMutation,
} from "@/store/api"
import { BookDetail } from "@/apiModels"
import { ContentEditable } from "./ContentEditable"
import { NarratorsInput } from "./NarratorsInput"
import { DeleteBookModal } from "../modals/DeleteBookModal"
import { useDisclosure } from "@mantine/hooks"
import { CreatorsInput } from "./CreatorsInput"

type Props = {
  book: BookDetail
}

export function BookEditForm({ book }: Props) {
  const [updateBook] = useUpdateBookMutation()

  const clearSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

  const form = useForm({
    initialValues: {
      title: book.title,
      subtitle: book.subtitle,
      language: book.language,
      authors: book.authors.map((author) => author.name),
      creators: book.creators as CreatorRelation[],
      series: book.series as SeriesRelation[],
      status: book.status?.uuid,
      collections: book.collections.map((collection) => collection.uuid),
      publicationDate: book.publicationDate && new Date(book.publicationDate),
      rating: book.rating,
      description: book.description,
      narrators: book.narrators.map((narrator) => narrator.name),
      tags: book.tags.map((tag) => tag.name),
      textCover: null as File | null,
      audioCover: null as File | null,
    },
  })

  const [opened, { open, close }] = useDisclosure()

  const {
    textCover,
    audioCover,
    creators: bookCreators,
    series: bookSeries,
    collections: bookCollections,
    status,
  } = form.values

  const [savedState, setSavedState] = useState<SaveState>(SaveState.CLEAN)

  return (
    <>
      <DeleteBookModal book={book} isOpen={opened} onClose={close} />
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
          value={status}
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
            textFallback={getCoverUrl(book.uuid, {
              height: px(98 * 3) as number,
              width: px(64 * 3) as number,
            })}
            audioFallback={getCoverUrl(book.uuid, {
              height: px(64 * 3) as number,
              width: px(64 * 3) as number,
              audio: true,
            })}
            getInputProps={form.getInputProps}
          />
          <Stack gap={32} className="grow">
            <TextInput
              className="m-0"
              label="Title"
              {...form.getInputProps("title")}
            />
            <TextInput
              className="m-0"
              label="Subtitle"
              {...form.getInputProps("subtitle")}
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
            <NarratorsInput
              narrators={creators}
              {...form.getInputProps("narrators")}
            />
            <ContentEditable
              className="m-0"
              label="Description"
              {...form.getInputProps("description")}
              value={form.values.description}
            />
            <AuthorsInput
              authors={creators}
              {...form.getInputProps("authors")}
            />
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
              getInputProps={form.getInputProps}
            />
          </Stack>
        </Group>

        <Group
          justify="space-between"
          className="sticky bottom-0 z-10 bg-white p-6"
        >
          <Button onClick={open} color="red" variant="outline">
            Delete book
          </Button>

          <Button type="submit" disabled={savedState === SaveState.LOADING}>
            {savedState === SaveState.SAVED ? "Saved!" : "Update"}
          </Button>
        </Group>
      </form>
    </>
  )
}
