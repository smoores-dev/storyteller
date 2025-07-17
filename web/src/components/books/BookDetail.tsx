"use client"
import {
  getDownloadUrl,
  useListBooksQuery,
  useListStatusesQuery,
  useUpdateBookMutation,
} from "@/store/api"
import { UUID } from "@/uuid"
import { Anchor, Group, Spoiler, Stack, Text, Title } from "@mantine/core"
import { BookThumbnailImage } from "./BookThumbnailImage"
import Link from "next/link"
import {
  IconBook2,
  IconBooks,
  IconHeadphonesFilled,
  IconPencil,
  IconTagFilled,
} from "@tabler/icons-react"
import { IconReadaloud } from "../icons/IconReadaloud"
import { StatusInput } from "./edit/StatusInput"

interface Props {
  bookUuid: UUID
}

export function BookDetail({ bookUuid }: Props) {
  const { book } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      book: result.data?.find((b) => b.uuid === bookUuid),
    }),
  })

  const { data: statuses = [] } = useListStatusesQuery()
  const [updateBook] = useUpdateBookMutation()

  if (!book) return "Loading..."

  return (
    <Stack>
      <Group gap={48} align="flex-start">
        <BookThumbnailImage book={book} height="20rem" width="13.0625rem" />
        <Stack className="mt-6 grow basis-[400px]">
          <Group>
            <Title className="font-sans" order={2}>
              {book.readaloud?.status === "ALIGNED" && (
                <IconReadaloud className="text-st-orange-600 -mb-4 -ml-2 -mr-1 -mt-6 inline-block h-10 w-10" />
              )}{" "}
              {book.title}
            </Title>
            <Link href={`/books/${book.uuid}/edit`}>
              <IconPencil />
            </Link>
          </Group>
          <Text>by {book.authors.map((author) => author.name).join(", ")}</Text>
          <Group>
            {book.tags.map((tag) => (
              <Group
                gap={8}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm"
                key={tag.uuid}
              >
                <IconTagFilled size={12} />
                {tag.name}
              </Group>
            ))}
          </Group>
          <Group>
            {book.collections.map((collection) => (
              <Link
                href={`/collection/${collection.uuid}`}
                className="flex flex-row items-center gap-2 rounded bg-gray-100 px-3 py-1 hover:bg-gray-200"
                key={collection.uuid}
              >
                <IconBooks size={16} />
                {collection.name}
              </Link>
            ))}
          </Group>
          {book.description && (
            <Spoiler
              className="max-w-prose"
              maxHeight={70}
              showLabel="Show more"
              hideLabel="Hide"
            >
              {book.description}
            </Spoiler>
          )}
        </Stack>
      </Group>
      <Group className="items-end justify-between">
        <StatusInput
          value={book.statusUuid}
          onChange={async (value) => {
            await updateBook({ update: { uuid: bookUuid, statusUuid: value } })
          }}
          options={statuses}
        />
        <Stack gap={4}>
          <Text className="self-end">Download</Text>
          <Group className="bg-st-orange-50 self-end px-4 py-2">
            {book.readaloud && (
              <Anchor href={getDownloadUrl(bookUuid, "readaloud")}>
                <IconReadaloud />
              </Anchor>
            )}
            {book.ebook && (
              <Anchor href={getDownloadUrl(bookUuid, "ebook")}>
                <IconBook2 />
              </Anchor>
            )}
            {book.audiobook && (
              <Anchor href={getDownloadUrl(bookUuid, "audiobook")}>
                <IconHeadphonesFilled />
              </Anchor>
            )}
          </Group>
        </Stack>
      </Group>

      <Stack className="rounded bg-gray-100 p-4" gap={4}>
        {book.readaloud && (
          <Text>
            <span className="font-bold">Readaloud file path:</span>{" "}
            {book.readaloud.filepath}
          </Text>
        )}
        {book.ebook && (
          <Text>
            <span className="font-bold">E-book file path:</span>{" "}
            {book.ebook.filepath}
          </Text>
        )}
        {book.audiobook && (
          <Text>
            <span className="font-bold">Audiobook file path:</span>{" "}
            {book.audiobook.filepath}
          </Text>
        )}
        {book.alignedAt && (
          <Text>
            <span className="font-bold">Last aligned:</span>{" "}
            {new Date(book.alignedAt).toLocaleString()}
          </Text>
        )}
        {book.alignedWith && (
          <Text>
            <span className="font-bold">Transcription engine:</span>{" "}
            {book.alignedWith}
          </Text>
        )}
        {book.alignedByStorytellerVersion && (
          <Text>
            <span className="font-bold">
              Storyteller version used to align:
            </span>{" "}
            {book.alignedByStorytellerVersion}
          </Text>
        )}
      </Stack>
    </Stack>
  )
}
