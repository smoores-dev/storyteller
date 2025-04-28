"use client"

import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import { BookOptions } from "./BookOptions"
import { ProcessingFailedMessage } from "./ProcessingFailedMessage"
import { usePermissions } from "@/contexts/UserPermissions"
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import { Paper, Group, Stack, Box, Text, Button, Progress } from "@mantine/core"
import { useLiveBooks } from "@/hooks/useLiveBooks"

type Props = {
  book: BookDetail
}

export const ProcessingTaskTypes = {
  SYNC_CHAPTERS: "Synchronizing chapters",
  SPLIT_CHAPTERS: "Pre-processing audio",
  TRANSCRIBE_CHAPTERS: "Transcribing tracks",
}

export function BookStatus({ book: initialBook }: Props) {
  const client = useApiClient()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const book = useLiveBooks([initialBook])[0]!

  const permissions = usePermissions()

  const aligned =
    book.processingTask?.type === ProcessingTaskType.SYNC_CHAPTERS &&
    book.processingTask.status === ProcessingTaskStatus.COMPLETED

  const userFriendlyTaskType =
    book.processingTask &&
    ProcessingTaskTypes[
      book.processingTask.type as keyof typeof ProcessingTaskTypes
    ]

  if (!permissions.bookRead) return null

  return (
    <Paper className="max-w-[600px]">
      <Group justify="space-between" wrap="nowrap" align="flex-end">
        <Stack justify="space-between" className="grow">
          {aligned ? (
            permissions.bookDownload && (
              <a
                href={client.getAlignedDownloadUrl(book.uuid)}
                className="text-st-orange-600 underline"
                download={`${book.title}.epub`}
              >
                Download
              </a>
            )
          ) : book.processingTask ? (
            book.processingStatus === "queued" ? (
              "Queued"
            ) : (
              <Box>
                {userFriendlyTaskType}
                {book.processingStatus === "processing" ? "" : " (stopped)"}
                {book.processingTask.status ===
                  ProcessingTaskStatus.IN_ERROR && <ProcessingFailedMessage />}
                <Progress
                  value={Math.floor(book.processingTask.progress * 100)}
                />
              </Box>
            )
          ) : permissions.bookProcess ? (
            <Button
              className="self-start"
              onClick={() => {
                void client.processBook(book.uuid)
              }}
            >
              Start processing
            </Button>
          ) : (
            <Text>Unprocessed</Text>
          )}
        </Stack>
        <BookOptions aligned={aligned} book={book} />
      </Group>
    </Paper>
  )
}
