"use client"

import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Group,
  RingProgress,
  Spoiler,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import {
  IconBook2,
  IconBooks,
  IconDotsCircleHorizontal,
  IconHeadphonesFilled,
  IconPencil,
  IconProgressX,
  IconTagFilled,
} from "@tabler/icons-react"
import Link from "next/link"

import { IconReadaloud } from "@/components/icons/IconReadaloud"
import {
  getDownloadUrl,
  useCancelProcessingMutation,
  useListBooksQuery,
  useListStatusesQuery,
  useUpdateBookMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { BookStatus } from "./BookStatus"
import { BookThumbnailImage } from "./BookThumbnailImage"
import { StatusInput } from "./edit/StatusInput"
import { DeleteBookModal } from "./modals/DeleteBookModal"

interface Props {
  bookUuid: UUID
}

export function BookDetails({ bookUuid }: Props) {
  const [opened, { open, close }] = useDisclosure()

  const { book } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      book: result.data?.find((book) => book.uuid === bookUuid),
    }),
  })
  const { data: statuses = [] } = useListStatusesQuery()
  const [updateBook] = useUpdateBookMutation()
  const [cancelProcessing] = useCancelProcessingMutation()

  if (!book) return null

  return (
    <>
      <DeleteBookModal book={book} isOpen={opened} onClose={close} />

      <Stack>
        <Group gap={48} align="flex-start">
          <Box h="20rem" className="group relative">
            <BookThumbnailImage book={book} height="20rem" width="13.0625rem" />
            {book.readaloud?.status === "QUEUED" && (
              <IconDotsCircleHorizontal
                size={40}
                color="white"
                className="absolute right-0 top-0 z-40 [filter:drop-shadow(0_0_1px_rgba(0,0,0,1))]"
              />
            )}
            {book.readaloud?.status === "PROCESSING" && (
              <RingProgress
                className="absolute right-0 top-0 z-40 [&>svg]:[filter:drop-shadow(0_0_1px_rgba(0,0,0,1))]"
                size={40}
                thickness={4}
                roundCaps
                rootColor="white"
                sections={[
                  {
                    value: book.readaloud.stageProgress * 100,
                    color: "st-orange",
                  },
                ]}
              />
            )}
            {(book.readaloud?.status === "QUEUED" ||
              book.readaloud?.status === "PROCESSING") && (
              <Tooltip
                position="right"
                label={
                  book.readaloud.status === "QUEUED"
                    ? "Remove from queue"
                    : "Stop processing"
                }
              >
                <ActionIcon
                  className="absolute right-[6px] top-[6px] z-50 hidden rounded-full group-hover:block"
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    void cancelProcessing({ uuid: book.uuid })
                  }}
                >
                  <IconProgressX
                    aria-label={
                      book.readaloud.status === "QUEUED"
                        ? "Remove from queue"
                        : "Stop processing"
                    }
                  />
                </ActionIcon>
              </Tooltip>
            )}
          </Box>
          <Stack className="mt-6 grow basis-[400px]">
            <Group>
              <Title className="font-sans" order={2}>
                {!!book.readaloud?.filepath && (
                  <IconReadaloud className="text-st-orange-600 -mb-4 -ml-2 -mr-1 -mt-6 inline-block h-10 w-10" />
                )}{" "}
                {book.title}
              </Title>
              <Link href={`/books/${book.uuid}/edit`}>
                <IconPencil />
              </Link>
            </Group>
            {book.subtitle && (
              <Title className="font-sans" order={3}>
                {book.subtitle}
              </Title>
            )}
            <Stack className="gap-1">
              <Text className="text-sm">
                by{" "}
                {book.authors.map((author, index) => (
                  <span key={author.uuid}>
                    <Link
                      href={`/books?authors=${author.uuid}`}
                      className="hover:text-st-orange-600 hover:underline"
                    >
                      {author.name}
                    </Link>
                    {index < book.authors.length - 1 && ", "}
                  </span>
                ))}
              </Text>
              {!!book.narrators.length && (
                <Text className="text-sm">
                  narrated by{" "}
                  {book.narrators.map((narrator, index) => (
                    <span key={narrator.uuid}>
                      {narrator.name}
                      {index < book.narrators.length - 1 && ", "}
                    </span>
                  ))}
                </Text>
              )}
              {book.series.map((s) => (
                <Text className="text-sm" key={s.uuid}>
                  {s.position !== null && `Book ${s.position} of `}
                  <Link
                    href={`/series?search=${s.name}`}
                    className="hover:text-st-orange-600 hover:underline"
                  >
                    {s.name}
                  </Link>
                </Text>
              ))}
            </Stack>
            {!!book.tags.length && (
              <Group>
                {book.tags.map((tag) => (
                  <Link
                    href={`/books?tags=${tag.uuid}`}
                    className="flex flex-row items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200"
                    key={tag.uuid}
                  >
                    <IconTagFilled size={12} />
                    {tag.name}
                  </Link>
                ))}
              </Group>
            )}
            {!!book.collections.length && (
              <Group>
                {book.collections.map((collection) => (
                  <Link
                    href={`/collections/${collection.uuid}`}
                    className="flex flex-row items-center gap-2 rounded bg-gray-100 px-3 py-1 hover:bg-gray-200"
                    key={collection.uuid}
                  >
                    <IconBooks size={16} />
                    {collection.name}
                  </Link>
                ))}
              </Group>
            )}
            {book.description && (
              <Spoiler
                className="max-w-prose"
                maxHeight={70}
                showLabel="Show more"
                hideLabel="Hide"
              >
                <div dangerouslySetInnerHTML={{ __html: book.description }} />
              </Spoiler>
            )}
          </Stack>
        </Group>
        <BookStatus bookUuid={book.uuid} />
        <Group className="items-end justify-between">
          <StatusInput
            value={book.status?.uuid}
            onChange={async (value) => {
              await updateBook({
                update: { uuid: book.uuid, status: value },
              })
            }}
            options={statuses}
          />
          <Stack gap={4}>
            <Text className="self-end">Download</Text>
            <Group className="bg-st-orange-50 self-end px-4 py-2">
              {!!book.readaloud?.filepath && (
                <Anchor
                  href={getDownloadUrl(book.uuid, "readaloud")}
                  className="hover:bg-st-orange-100 rounded-md"
                >
                  <IconReadaloud />
                </Anchor>
              )}
              {book.ebook && (
                <Anchor
                  href={getDownloadUrl(book.uuid, "ebook")}
                  className="hover:bg-st-orange-100 rounded-md"
                >
                  <IconBook2 />
                </Anchor>
              )}
              {book.audiobook && (
                <Anchor
                  href={getDownloadUrl(book.uuid, "audiobook")}
                  className="hover:bg-st-orange-100 rounded-md"
                >
                  <IconHeadphonesFilled />
                </Anchor>
              )}
            </Group>
          </Stack>
        </Group>

        <Stack className="rounded bg-gray-100 p-4" gap={4}>
          {book.readaloud?.filepath && (
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
        <Group className="mt-8 justify-end">
          <Button onClick={open} color="red">
            Delete book
          </Button>
        </Group>
      </Stack>
    </>
  )
}
