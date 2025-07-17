import {
  Stack,
  Box,
  RingProgress,
  ActionIcon,
  Tooltip,
  Text,
} from "@mantine/core"
import { BookDetail } from "@/apiModels"
import Link from "next/link"
import { IconDotsCircleHorizontal, IconProgressX } from "@tabler/icons-react"
import { useCancelProcessingMutation } from "@/store/api"
import { IconReadaloud } from "../icons/IconReadaloud"
import { BookThumbnailImage } from "./BookThumbnailImage"

interface Props {
  book: BookDetail
  link?: boolean
  onClick?: () => void
}

export function BookThumbnail({ book, link, onClick }: Props) {
  const [cancelProcessing] = useCancelProcessingMutation()

  const inner = (
    <Stack gap={2} className="h-[18.9375rem]">
      <Stack className="mb-1 h-[14.0625rem] flex-col justify-center">
        <Box className="relative h-[14.0625rem] w-[9.1875rem]">
          <BookThumbnailImage
            height="14.0625rem"
            width="9.1875rem"
            book={book}
          />
          {book.processingStatus === "queued" && (
            <IconDotsCircleHorizontal
              size={40}
              color="white"
              className="absolute right-0 top-0 [filter:drop-shadow(0_0_4px_rgba(0,0,0,1))]"
            />
          )}
          {book.processingTask && book.processingStatus === "processing" && (
            <RingProgress
              className="absolute right-0 top-0 [&>svg]:[filter:drop-shadow(0_0_4px_rgba(0,0,0,1))]"
              size={40}
              thickness={4}
              roundCaps
              rootColor="white"
              sections={[
                {
                  value: book.processingTask.progress * 100,
                  color: "st-orange",
                },
              ]}
            />
          )}
          {book.processingStatus && (
            <Tooltip
              position="right"
              label={
                book.processingStatus === "queued"
                  ? "Remove from queue"
                  : "Stop processing"
              }
            >
              <ActionIcon
                className="absolute right-[6px] top-[6px] hidden rounded-full group-hover:block"
                color="red"
                onClick={() => cancelProcessing({ uuid: book.uuid })}
              >
                <IconProgressX
                  aria-label={
                    book.processingStatus === "queued"
                      ? "Remove from queue"
                      : "Stop processing"
                  }
                />
              </ActionIcon>
            </Tooltip>
          )}
        </Box>
      </Stack>
      <Text className="line-clamp-2 max-w-[9.1875rem] bg-white text-sm font-semibold group-hover:line-clamp-none">
        {book.readaloud?.status === "ALIGNED" && (
          <IconReadaloud className="text-st-orange-600 -mx-1 -mb-2 -mt-3 inline-block h-6 w-6" />
        )}{" "}
        {book.title}
      </Text>
      <Text className="max-w-[9.1875rem] bg-white pb-2 text-sm">
        {book.authors[0]?.name}
      </Text>
    </Stack>
  )

  if (link) {
    return (
      <Link href={`/books/${book.uuid}`} className="group">
        {inner}
      </Link>
    )
  }

  return (
    <Box className="group" onClick={onClick}>
      {inner}
    </Box>
  )
}
