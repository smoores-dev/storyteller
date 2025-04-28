import NextImage from "next/image"
import {
  Stack,
  Image,
  Title,
  Text,
  Box,
  RingProgress,
  ActionIcon,
  Tooltip,
} from "@mantine/core"
import { useApiClient } from "@/hooks/useApiClient"
import { BookDetail } from "@/apiModels"
import Link from "next/link"
import { IconDotsCircleHorizontal, IconProgressX } from "@tabler/icons-react"

interface Props {
  book: BookDetail
}

export function BookThumbnail({ book }: Props) {
  const client = useApiClient()
  return (
    <Link href={`/books/${book.uuid}`} className="group">
      <Stack gap={2}>
        <Box className="relative h-[225px] w-[147px]">
          <Image
            className="group-hover:border-st-orange-300 h-full rounded-md group-hover:border-2"
            component={NextImage}
            height={225}
            width={147}
            alt=""
            aria-hidden
            src={client.getCoverUrl(book.uuid)}
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
                onClick={() => client.cancelProcessing(book.uuid)}
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
        <Title order={3} className="max-w-[147px] text-base">
          {book.title}
        </Title>
        {book.authors[0] && (
          <Text className="max-w-[147px] text-sm">{book.authors[0].name}</Text>
        )}
      </Stack>
    </Link>
  )
}
