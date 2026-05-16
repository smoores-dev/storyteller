"use client"

import {
  Button,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  px,
} from "@mantine/core"
import { DateInput } from "@mantine/dates"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { useRef, useState } from "react"

import { Label } from "@/app/(v3)/v3/_/components/ui/label"
import { DeleteBookModal } from "@/components/books/modals/DeleteBookModal"
import { SaveState } from "@/components/forms"
import { formatTimeHuman } from "@/components/reader/preferenceItems/formatTime"
import {
  type BookWithRelations,
  type CreatorRelation,
  type SeriesRelation,
} from "@/database/books"
import {
  getCoverUrl,
  useListCollectionsQuery,
  useListCreatorsQuery,
  useListSeriesQuery,
  useListStatusesQuery,
  useListTagsQuery,
  useUpdateBookMutation,
} from "@/store/api"

import { AuthorsInput } from "./AuthorsInput"
import { CollectionsInput } from "./CollectionsInput"
import { ContentEditable } from "./ContentEditable"
import { CoverImageInput } from "./CoverImageInput"
import { CreatorsInput } from "./CreatorsInput"
import { NarratorsInput } from "./NarratorsInput"
import { SeriesInput } from "./SeriesInput"
import { StatusInput } from "./StatusInput"
import { TagsInput } from "./TagsInput"

function DurationInput({
  book,
  value,
  onChange,
}: {
  book: BookWithRelations
  value: number | null
  onChange: (value: number | null) => void
}) {
  const totalSeconds = value ?? 0

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.round(totalSeconds % 60)

  function update(h: number, m: number, s: number) {
    const total = h * 3600 + m * 60 + s
    onChange(total === 0 ? null : total)
  }

  const durationParts: string[] = []
  if (book.audiobook) {
    durationParts.push(
      `audiobook (${book.audiobook.duration ? formatTimeHuman(book.audiobook.duration) : "unknown"})`,
    )
  }
  if (book.readaloud) {
    durationParts.push(
      `readaloud (${book.readaloud.duration ? formatTimeHuman(book.readaloud.duration) : "unknown"})`,
    )
  }

  const durationDescription = durationParts.length
    ? `Custom duration. Overrides the value derived from the ${durationParts.join(" or ")} when set.`
    : "Custom duration. No audiobook or readaloud attached to this book."

  return (
    <div className="flex flex-col">
      <Label className="m-0 text-sm font-medium">Audiobook duration</Label>
      <Text className="m-0 text-xs" c="dimmed">
        {durationDescription}
      </Text>

      <Group grow align="flex-end">
        <NumberInput
          label="Hours"
          min={0}
          value={hours}
          onChange={(val) => {
            update(val === "" ? 0 : Number(val), minutes, seconds)
          }}
        />

        <NumberInput
          label="Minutes"
          min={0}
          max={59}
          value={minutes}
          onChange={(val) => {
            update(hours, val === "" ? 0 : Number(val), seconds)
          }}
        />

        <NumberInput
          label="Seconds"
          min={0}
          max={59}
          value={seconds}
          onChange={(val) => {
            update(hours, minutes, val === "" ? 0 : Number(val))
          }}
        />

        <NumberInput
          label="= Total Seconds"
          value={totalSeconds}
          readOnly
          variant="filled"
        />
      </Group>
    </div>
  )
}

type Props = {
  book: BookWithRelations
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
      duration: book.duration,
      pageCount: book.pageCount,
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
        <p className="text-sm text-red-500">
          Failed to update. Check your server and/or browser console logs for
          details.
        </p>
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
                  new Date(update.publicationDate).toISOString(),
              },
              textCover,
              audioCover,
            })
          } catch (error) {
            console.error(error)
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
              updatedAt: book.updatedAt,
            })}
            audioFallback={getCoverUrl(book.uuid, {
              height: px(64 * 3) as number,
              width: px(64 * 3) as number,
              updatedAt: book.updatedAt,
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

            <NumberInput
              className="m-0"
              label="Page count"
              description={(() => {
                const parts: string[] = []
                if (book.ebook) {
                  parts.push(`ebook (${book.ebook.pageCount ?? "unknown"})`)
                }
                if (book.readaloud) {
                  parts.push(
                    `readaloud (${book.readaloud.pageCount ?? "unknown"})`,
                  )
                }

                return parts.length
                  ? `Custom page count. Overrides the value derived from the ${parts.join(" or ")} when set.`
                  : "Custom page count. No ebook or readaloud attached to this book."
              })()}
              min={0}
              value={form.values.pageCount ?? ""}
              onChange={(val) => {
                form.setFieldValue("pageCount", val === "" ? null : Number(val))
              }}
            />

            <DurationInput
              book={book}
              value={form.values.duration}
              onChange={(val) => {
                form.setFieldValue("duration", val)
              }}
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
          className="sticky bottom-0 z-10 bg-white p-6 dark:bg-neutral-800"
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
