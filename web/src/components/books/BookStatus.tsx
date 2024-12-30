"use client"

import NextImage from "next/image"
import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import { BookOptions } from "./BookOptions"
import { ProcessingFailedMessage } from "./ProcessingFailedMessage"
import { usePermissions } from "@/contexts/UserPermissions"
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import {
  Paper,
  Image,
  Group,
  Stack,
  Box,
  Title,
  Text,
  Button,
  Progress,
} from "@mantine/core"

type Props = {
  book: BookDetail
}

export const ProcessingTaskTypes = {
  SYNC_CHAPTERS: "Synchronizing chapters",
  SPLIT_CHAPTERS: "Pre-processing audio",
  TRANSCRIBE_CHAPTERS: "Transcribing tracks",
}

export function BookStatus({ book }: Props) {
  const client = useApiClient()

  const permissions = usePermissions()

  const synchronized =
    book.processing_status?.current_task === ProcessingTaskType.SYNC_CHAPTERS &&
    book.processing_status.status === ProcessingTaskStatus.COMPLETED

  const userFriendlyTaskType =
    book.processing_status &&
    ProcessingTaskTypes[
      book.processing_status.current_task as keyof typeof ProcessingTaskTypes
    ]

  if (!permissions.book_read) return null

  return (
    <Paper className="max-w-[600px]">
      <Group justify="space-between" wrap="nowrap" align="stretch">
        <Image
          className="rounded-md"
          component={NextImage}
          h={150}
          w={98}
          height={150}
          width={98}
          alt=""
          aria-hidden
          src={client.getCoverUrl(book.uuid)}
        />
        <Stack justify="space-between" className="grow">
          <Box>
            <Title order={3} className="text-lg">
              {book.title}
            </Title>
            {book.authors[0] && <Text>{book.authors[0].name}</Text>}
          </Box>
          {synchronized ? (
            permissions.book_download && (
              <a
                href={client.getSyncedDownloadUrl(book.uuid)}
                className="text-st-orange-600 underline"
              >
                Download
              </a>
            )
          ) : book.processing_status ? (
            book.processing_status.is_queued ? (
              "Queued"
            ) : (
              <Box>
                {userFriendlyTaskType}
                {book.processing_status.is_processing ? "" : " (stopped)"}
                {book.processing_status.status ===
                  ProcessingTaskStatus.IN_ERROR && <ProcessingFailedMessage />}
                <Progress
                  value={Math.floor(book.processing_status.progress * 100)}
                />
              </Box>
            )
          ) : permissions.book_process ? (
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
        <BookOptions synchronized={synchronized} book={book} />
      </Group>
    </Paper>
  )
}
