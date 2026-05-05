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
  IconFileArrowRight,
  IconHeadphonesFilled,
  IconPencil,
  IconPlayerPlay,
  IconProgressX,
  IconTagFilled,
} from "@tabler/icons-react"
import Link from "next/link"

import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { formatTimeHuman } from "@/components/reader/preferenceItems/formatTime"
import { type BookWithRelations } from "@/database/books"
import { usePermissions } from "@/hooks/usePermissions"
import {
  getDownloadUrl,
  useCancelProcessingMutation,
  useGetBookQuery,
  useListStatusesQuery,
  useUpdateStatusMutation,
} from "@/store/api"
import { formatFileSize } from "@/utils/formatFileSize"
import { type UUID } from "@/uuid"

import { BookStatus } from "./BookStatus"
import { BookThumbnailImage } from "./BookThumbnailImage"
import { StatusInput } from "./edit/StatusInput"
import { DeleteBookModal } from "./modals/DeleteBookModal"
import { UpgradeEpubModal } from "./modals/UpgradeEpubModal"

interface Props {
  bookUuid: UUID
  hideReadButton?: boolean
}

function Details({
  book,
  format,
}: {
  book: BookWithRelations
  format: "ebook" | "audiobook" | "readaloud"
}) {
  const fmt = book[format]
  if (!fmt) {
    return null
  }

  const Icon =
    format === "ebook"
      ? IconBook2
      : format === "audiobook"
        ? IconHeadphonesFilled
        : IconReadaloud

  return (
    <Text className="flex flex-row items-center gap-2">
      <Icon />
      <div className="flex flex-col gap-0.5">
        <div
          className="line-clamp-1 text-sm font-semibold"
          title={fmt.filepath ?? ""}
        >
          {fmt.filepath}
        </div>
        <div className="flex flex-row items-center gap-2 text-xs">
          {fmt.missing ? (
            <span className="text-red-500">Missing</span>
          ) : (
            <>
              {format !== "audiobook" && <span>{fmt.pageCount} pages</span>}
              {format !== "ebook" && (
                <span>{formatTimeHuman(fmt.duration ?? 0)}</span>
              )}

              <span>{formatFileSize(fmt.fileSize ?? null) ?? "0.0 MB"}</span>

              {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
                Boolean("isEpub2" in fmt && fmt.isEpub2) && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    EPUB 2
                  </span>
                )
              }
            </>
          )}
        </div>
      </div>
    </Text>
  )
}

export function BookDetails({ bookUuid, hideReadButton = false }: Props) {
  const [opened, { open, close }] = useDisclosure()
  const [
    upgradeModalOpen,
    { open: openUpgradeModal, close: closeUpgradeModal },
  ] = useDisclosure()

  const permissions = usePermissions()

  const { data: book } = useGetBookQuery({ uuid: bookUuid })
  const { data: statuses = [] } = useListStatusesQuery()
  const [updateStatus] = useUpdateStatusMutation()
  const [cancelProcessing] = useCancelProcessingMutation()

  if (!book) return null

  const hasEpubFiles =
    book.ebook?.filepath.endsWith(".epub") ||
    book.readaloud?.filepath?.endsWith(".epub")

  return (
    <>
      <DeleteBookModal book={book} isOpen={opened} onClose={close} />

      <UpgradeEpubModal
        bookUuids={[book.uuid]}
        isOpen={upgradeModalOpen}
        onClose={closeUpgradeModal}
      />

      <Stack>
        <Group gap={48} align="flex-start">
          <Box h="20rem" className="group relative">
            <BookThumbnailImage book={book} height="20rem" width="13.0625rem" />
            {book.readaloud?.status === "QUEUED" && (
              <IconDotsCircleHorizontal
                size={40}
                color="white"
                className="absolute top-0 right-0 z-40 filter-[drop-shadow(0_0_1px_rgba(0,0,0,1))]"
              />
            )}
            {book.readaloud?.status === "PROCESSING" && (
              <RingProgress
                className="absolute top-0 right-0 z-40 [&>svg]:[filter:drop-shadow(0_0_1px_rgba(0,0,0,1))] dark:[&>svg]:[filter:drop-shadow(0_0_1px_rgba(255,255,255,1))]"
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
                  className="absolute top-[6px] right-[6px] z-50 hidden rounded-full group-hover:block"
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
            <Group wrap="nowrap">
              <Title className="font-sans" order={2}>
                {!!book.readaloud?.filepath && (
                  <IconReadaloud className="text-st-orange-600 -mt-6 -mr-1 -mb-4 -ml-2 inline-block h-10 w-10" />
                )}{" "}
                {book.title}
              </Title>
              {!!permissions?.bookUpdate && (
                <Link href={`/books/${book.uuid}/edit`}>
                  <IconPencil />
                </Link>
              )}
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
                    className="flex flex-row items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200 dark:bg-neutral-700"
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
                    className="flex flex-row items-center gap-2 rounded bg-gray-100 px-3 py-1 hover:bg-gray-200 dark:bg-neutral-700"
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
          {!!permissions?.bookDownload && !hideReadButton && (
            <>
              {book.readaloud?.status === "ALIGNED" && (
                <Link
                  href={`/books/${book.uuid}/read?mode=readaloud`}
                  className="hover:bg-st-orange-600 bg-st-orange-500 flex gap-2 rounded-sm px-4 py-2 text-white"
                >
                  <IconPlayerPlay /> Read
                </Link>
              )}
              {book.readaloud?.status !== "ALIGNED" && book.ebook && (
                <Link
                  href={`/books/${book.uuid}/read?mode=epub`}
                  className="hover:bg-st-orange-600 bg-st-orange-500 flex gap-2 rounded-sm px-4 py-2 text-white"
                >
                  <IconBook2 /> Read
                </Link>
              )}
              {book.readaloud?.status !== "ALIGNED" && book.audiobook && (
                <Link
                  href={`/books/${book.uuid}/read?mode=audiobook`}
                  className="hover:bg-st-orange-600 bg-st-orange-500 flex gap-2 rounded-sm px-4 py-2 text-white"
                >
                  <IconHeadphonesFilled /> Listen
                </Link>
              )}
            </>
          )}
          {!!permissions?.bookDownload && (
            <>
              <StatusInput
                value={book.status?.uuid}
                onChange={async (value) => {
                  await updateStatus({
                    bookUuid: book.uuid,
                    statusUuid: value,
                  })
                }}
                options={statuses}
              />

              <Stack gap={4}>
                <Text className="self-end">Download</Text>
                <Group className="bg-st-orange-50 dark:bg-st-orange-500 h-10 self-end rounded-sm px-4">
                  {!!book.readaloud?.filepath && (
                    <Anchor
                      href={getDownloadUrl(book.uuid, "readaloud")}
                      className="hover:text-st-orange-100 dark:text-st-orange-50 rounded-md"
                    >
                      <IconReadaloud />
                    </Anchor>
                  )}
                  {book.ebook && (
                    <Anchor
                      href={getDownloadUrl(book.uuid, "ebook")}
                      className="hover:text-st-orange-100 dark:text-st-orange-50 rounded-md"
                    >
                      <IconBook2 />
                    </Anchor>
                  )}
                  {book.audiobook && (
                    <Anchor
                      href={getDownloadUrl(book.uuid, "audiobook")}
                      className="hover:text-st-orange-100 dark:text-st-orange-50 rounded-md"
                    >
                      <IconHeadphonesFilled />
                    </Anchor>
                  )}
                </Group>
              </Stack>
            </>
          )}
        </Group>

        <Stack
          className="rounded-sm bg-gray-100 p-4 dark:bg-neutral-700"
          gap={4}
        >
          <Details book={book} format="readaloud" />
          <Details book={book} format="ebook" />
          <Details book={book} format="audiobook" />
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
          {!!permissions?.bookUpdate && hasEpubFiles && (
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconFileArrowRight size={14} />}
              onClick={openUpgradeModal}
            >
              Convert to EPUB 3
            </Button>
          )}

          {!!permissions?.bookDelete && (
            <Button onClick={open} color="red">
              Delete book
            </Button>
          )}
        </Group>
      </Stack>
    </>
  )
}
