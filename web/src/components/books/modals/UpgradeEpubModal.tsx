import {
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core"
import {
  IconCheck,
  IconFileArrowRight,
  IconMinus,
  IconX,
} from "@tabler/icons-react"
import { Fragment, useCallback, useRef, useState } from "react"

import { type UpgradeResult } from "@/app/api/v2/books/[bookId]/upgrade-epub/route"
import { useListBooksQuery, useUpgradeBookEpubMutation } from "@/store/api"
import { type UUID } from "@/uuid"

type BookStatus = "pending" | "running" | "upgraded" | "already_epub3" | "error"

function rollUpResults(results: Record<string, UpgradeResult>): BookStatus {
  const values = Object.values(results)

  if (values.some((v) => v === "error")) return "error"
  if (values.some((v) => v === "upgraded")) return "upgraded"

  return "already_epub3"
}

function statusLabel(status: BookStatus) {
  switch (status) {
    case "pending":
      return null
    case "running":
      return "Converting..."
    case "upgraded":
      return "Converted"
    case "already_epub3":
      return "Already EPUB 3"
    case "error":
      return "Failed"
  }
}

function StatusIcon({ status }: { status: BookStatus }) {
  switch (status) {
    case "pending":
      return (
        <ThemeIcon variant="light" color="gray" size="sm" radius="xl">
          <IconMinus size={12} />
        </ThemeIcon>
      )
    case "running":
      return <Loader size="xs" />
    case "upgraded":
      return (
        <ThemeIcon variant="light" color="green" size="sm" radius="xl">
          <IconCheck size={12} />
        </ThemeIcon>
      )
    case "already_epub3":
      return (
        <ThemeIcon variant="light" color="gray" size="sm" radius="xl">
          <IconCheck size={12} />
        </ThemeIcon>
      )
    case "error":
      return (
        <ThemeIcon variant="light" color="red" size="sm" radius="xl">
          <IconX size={12} />
        </ThemeIcon>
      )
  }
}

const EMPTY_BOOKS: never[] = []

interface Props {
  bookUuids: UUID[]
  isOpen: boolean
  onClose: () => void
}

export function UpgradeEpubModal({ bookUuids, isOpen, onClose }: Props) {
  const [upgradeBookEpub] = useUpgradeBookEpubMutation()

  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm")
  const [bookStatuses, setBookStatuses] = useState<Record<UUID, BookStatus>>({})
  const runningRef = useRef(false)

  const { books } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      books:
        result.data?.filter((book) => bookUuids.includes(book.uuid)) ??
        EMPTY_BOOKS,
    }),
  })

  const booksWithEpubs = books.filter(
    (book) =>
      book.ebook?.filepath.endsWith(".epub") ||
      book.readaloud?.filepath?.endsWith(".epub"),
  )

  const handleConvert = useCallback(async () => {
    if (runningRef.current) return

    runningRef.current = true
    setPhase("running")

    const initial: Record<UUID, BookStatus> = {}
    for (const book of booksWithEpubs) {
      initial[book.uuid] = "pending"
    }
    setBookStatuses(initial)

    for (const book of booksWithEpubs) {
      setBookStatuses((prev) => ({ ...prev, [book.uuid]: "running" }))

      const result = await upgradeBookEpub({ uuid: book.uuid })

      const status: BookStatus =
        "error" in result ? "error" : rollUpResults(result.data)

      setBookStatuses((prev) => ({ ...prev, [book.uuid]: status }))
    }

    setPhase("done")
    runningRef.current = false
  }, [booksWithEpubs, upgradeBookEpub])

  const handleClose = useCallback(() => {
    if (phase === "running") return

    setPhase("confirm")
    setBookStatuses({})
    onClose()
  }, [phase, onClose])

  const showBookList = booksWithEpubs.length > 1 || phase !== "confirm"
  const isRunning = phase === "running"

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title="Convert to EPUB 3"
      centered
      size="sm"
      closeOnClickOutside={!isRunning}
      closeOnEscape={!isRunning}
      withCloseButton={!isRunning}
    >
      <Stack gap={16}>
        {phase === "confirm" && (
          <Text>
            Convert EPUB files to EPUB 3 for{" "}
            <TitleSummary books={booksWithEpubs} />. Files that are already EPUB
            3 will be skipped. A backup of each original file will be created.
          </Text>
        )}

        {showBookList && (
          <Stack gap={8}>
            {booksWithEpubs.map((book) => {
              const status = bookStatuses[book.uuid]

              return (
                <Group key={book.uuid} gap={8} wrap="nowrap">
                  {status && <StatusIcon status={status} />}

                  <Text size="sm" className="min-w-0 flex-1 truncate">
                    {book.title}
                  </Text>

                  {status && (
                    <Text
                      size="xs"
                      c={status === "error" ? "red" : "dimmed"}
                      className="shrink-0"
                    >
                      {statusLabel(status)}
                    </Text>
                  )}
                </Group>
              )
            })}
          </Stack>
        )}

        {phase === "done" && <ResultSummary statuses={bookStatuses} />}

        <Group justify="flex-end">
          {phase === "confirm" && (
            <>
              <Button variant="subtle" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                leftSection={<IconFileArrowRight size={16} />}
                onClick={handleConvert}
                disabled={booksWithEpubs.length === 0}
              >
                Convert
              </Button>
            </>
          )}

          {phase === "done" && <Button onClick={handleClose}>Close</Button>}
        </Group>
      </Stack>
    </Modal>
  )
}

function ResultSummary({ statuses }: { statuses: Record<UUID, BookStatus> }) {
  const values = Object.values(statuses)

  const upgraded = values.filter((v) => v === "upgraded").length
  const skipped = values.filter((v) => v === "already_epub3").length
  const failed = values.filter((v) => v === "error").length

  const parts: string[] = []
  if (upgraded > 0) parts.push(`${upgraded} converted`)
  if (skipped > 0) parts.push(`${skipped} already EPUB 3`)
  if (failed > 0) parts.push(`${failed} failed`)

  return (
    <Text size="sm" c="dimmed">
      {parts.join(", ")}.
    </Text>
  )
}

interface TitleSummaryProps {
  books: { uuid: UUID; title: string }[]
}

function TitleSummary({ books }: TitleSummaryProps) {
  if (books.length === 0) return null

  if (books.length === 1) {
    return <strong>{books[0]?.title}</strong>
  }

  if (books.length === 2) {
    return (
      <>
        <strong>{books[0]?.title}</strong> and{" "}
        <strong>{books[1]?.title}</strong>
      </>
    )
  }

  return (
    <>
      {books.slice(0, 2).map((book, i, arr) => (
        <Fragment key={book.uuid}>
          <strong>{book.title}</strong>
          {i < arr.length - 1 ? ", " : ""}
        </Fragment>
      ))}
      , and {books.length - 2} more
    </>
  )
}
