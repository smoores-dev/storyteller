"use client"

import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Group,
  Menu,
  Modal,
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
  IconPlayerPlay,
  IconPlus,
  IconProgressX,
  IconRefresh,
  IconTagFilled,
  IconTrash,
} from "@tabler/icons-react"
import Link from "next/link"
import { useState } from "react"

import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { formatTimeHuman } from "@/components/reader/preferenceItems/formatTime"
import { type BookWithRelations } from "@/database/books"
import { usePermissions } from "@/hooks/usePermissions"
import {
  getDownloadUrl,
  useCancelProcessingMutation,
  useGetBookQuery,
  useListStatusesQuery,
  useRemoveBookAssetMutation,
  useUpdateStatusMutation,
} from "@/store/api"
import { formatFileSize } from "@/utils/formatFileSize"
import { type UUID } from "@/uuid"

import { BookStatus } from "./BookStatus"
import { BookThumbnailImage } from "./BookThumbnailImage"
import { StatusInput } from "./edit/StatusInput"
import { DeleteBookModal } from "./modals/DeleteBookModal"
import { ReplaceFileModal } from "./modals/ReplaceFileModal"
import { UpgradeEpubModal } from "./modals/UpgradeEpubModal"

interface Props {
  bookUuid: UUID
  hideReadButton?: boolean
}

const FORMAT_LABELS: Record<"ebook" | "audiobook" | "readaloud", string> = {
  ebook: "ebook",
  audiobook: "audiobook",
  readaloud: "readaloud",
}

function Details({
  book,
  format,
  onUpgradeEpub,
  canReplace,
  canRemove,
}: {
  book: BookWithRelations
  format: "ebook" | "audiobook" | "readaloud"
  onUpgradeEpub?: () => void
  canReplace?: boolean
  canRemove?: boolean
}) {
  const [replaceOpen, { open: openReplace, close: closeReplace }] =
    useDisclosure()
  const [removeOpen, { open: openRemove, close: closeRemove }] = useDisclosure()
  const [removeAsset, { isLoading: isRemoving }] = useRemoveBookAssetMutation()

  const fmt = book[format]
  if (!fmt) return null

  const Icon =
    format === "ebook"
      ? IconBook2
      : format === "audiobook"
        ? IconHeadphonesFilled
        : IconReadaloud

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
  const isEpub2 = Boolean("isEpub2" in fmt && fmt.isEpub2)

  async function handleConfirmRemove() {
    await removeAsset({ uuid: book.uuid, format }).unwrap()
    closeRemove()
  }

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
            <>
              <span className="font-semibold text-red-500">File missing</span>
              {canReplace && (
                <Button
                  variant="light"
                  color="red"
                  size="compact-xs"
                  leftSection={<IconRefresh size={12} />}
                  onClick={openReplace}
                >
                  Replace file
                </Button>
              )}
            </>
          ) : (
            <>
              {format !== "audiobook" && (
                <span>
                  {book.pageCount ?? book[format]?.pageCount ?? "Unknown"} pages
                </span>
              )}
              {format !== "ebook" && (
                <span>
                  {formatTimeHuman(
                    book.duration ?? book[format]?.duration ?? 0,
                  )}
                </span>
              )}

              <span>{formatFileSize(fmt.fileSize ?? null) ?? "0.0 MB"}</span>

              {isEpub2 && (
                <Tooltip
                  label="EPUB 2 is not fully supported. Click to convert to EPUB 3."
                  position="top"
                  withArrow
                  disabled={!onUpgradeEpub}
                >
                  <span
                    role={onUpgradeEpub ? "button" : undefined}
                    tabIndex={onUpgradeEpub ? 0 : undefined}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      onUpgradeEpub
                        ? "cursor-pointer bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                    onClick={onUpgradeEpub}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        onUpgradeEpub?.()
                      }
                    }}
                  >
                    EPUB 2
                  </span>
                </Tooltip>
              )}
            </>
          )}
          {canReplace && (
            <Tooltip label="Replace file" position="top" withArrow>
              <ActionIcon
                variant="subtle"
                size="xs"
                onClick={openReplace}
                aria-label={`Replace ${format} file`}
              >
                <IconRefresh size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {canReplace && canRemove && (
            <Tooltip
              label={`Remove ${FORMAT_LABELS[format]} from book`}
              position="top"
              withArrow
            >
              <ActionIcon
                variant="subtle"
                color="red"
                size="xs"
                onClick={openRemove}
                aria-label={`Remove ${format} from book`}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      </div>
      {canReplace && (
        <>
          <ReplaceFileModal
            isOpen={replaceOpen}
            onClose={closeReplace}
            book={book}
            format={format}
          />
          <Modal
            opened={removeOpen}
            onClose={closeRemove}
            title={`Remove ${FORMAT_LABELS[format]} from book`}
            centered
            size="sm"
          >
            <Stack>
              <Text size="sm">
                Are you sure you want to remove the {FORMAT_LABELS[format]} from{" "}
                <strong>{book.title}</strong>?
              </Text>
              <Text size="xs" c="dimmed">
                {format === "readaloud"
                  ? "The readaloud file will be deleted from disk."
                  : "Library-owned files will be deleted. Files in your watch folders are left on disk."}
              </Text>
              <Group justify="space-between">
                <Button
                  variant="subtle"
                  onClick={closeRemove}
                  disabled={isRemoving}
                >
                  Cancel
                </Button>
                <Button
                  color="red"
                  onClick={handleConfirmRemove}
                  loading={isRemoving}
                >
                  Remove
                </Button>
              </Group>
            </Stack>
          </Modal>
        </>
      )}
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

  const [addFormat, setAddFormat] = useState<
    "ebook" | "audiobook" | "readaloud" | null
  >(null)

  if (!book) return null

  const missingFormats = (["ebook", "audiobook", "readaloud"] as const).filter(
    (f) => !book[f],
  )
  const presentFormatCount = 3 - missingFormats.length

  return (
    <>
      <DeleteBookModal book={book} isOpen={opened} onClose={close} />

      <UpgradeEpubModal
        bookUuids={[book.uuid]}
        isOpen={upgradeModalOpen}
        onClose={closeUpgradeModal}
      />

      {addFormat && (
        <ReplaceFileModal
          isOpen
          onClose={() => {
            setAddFormat(null)
          }}
          book={book}
          format={addFormat}
        />
      )}

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
                <Group gap="xs" className="self-end">
                  <Group className="bg-st-orange-50 dark:bg-st-orange-500 h-10 rounded-sm px-4">
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
                  {permissions.bookUpdate && missingFormats.length > 0 && (
                    <Menu position="bottom-end" withArrow>
                      <Menu.Target>
                        <Tooltip label="Add file" position="top" withArrow>
                          <ActionIcon
                            variant="light"
                            size="lg"
                            aria-label="Add file"
                          >
                            <IconPlus size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {missingFormats.map((f) => {
                          const FormatIcon =
                            f === "ebook"
                              ? IconBook2
                              : f === "audiobook"
                                ? IconHeadphonesFilled
                                : IconReadaloud
                          return (
                            <Menu.Item
                              key={f}
                              leftSection={<FormatIcon size={14} />}
                              onClick={() => {
                                setAddFormat(f)
                              }}
                            >
                              Add {FORMAT_LABELS[f]}
                            </Menu.Item>
                          )
                        })}
                      </Menu.Dropdown>
                    </Menu>
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
          <Details
            book={book}
            format="readaloud"
            onUpgradeEpub={
              permissions?.bookUpdate ? openUpgradeModal : undefined
            }
            canReplace={permissions?.bookUpdate}
            canRemove={presentFormatCount > 1}
          />
          <Details
            book={book}
            format="ebook"
            onUpgradeEpub={
              permissions?.bookUpdate ? openUpgradeModal : undefined
            }
            canReplace={permissions?.bookUpdate}
            canRemove={presentFormatCount > 1}
          />
          <Details
            book={book}
            format="audiobook"
            canReplace={permissions?.bookUpdate}
            canRemove={presentFormatCount > 1}
          />
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
          {!!permissions?.bookUpdate && book.assetDir && (
            <Text>
              <span className="font-bold">Asset folder:</span>{" "}
              {book.assetDir}
            </Text>
          )}
        </Stack>

        <Group className="mt-8 justify-end">
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
