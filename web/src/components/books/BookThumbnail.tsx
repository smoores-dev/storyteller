import {
  ActionIcon,
  Box,
  RingProgress,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core"
import { IconDotsCircleHorizontal, IconProgressX } from "@tabler/icons-react"
import cx from "classnames"
import Link from "next/link"

import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { type BookWithRelations } from "@/database/books"
import { useCancelProcessingMutation } from "@/store/api"

import { BookThumbnailImage } from "./BookThumbnailImage"

interface Props {
  book: BookWithRelations
  link?: boolean
  onClick?: () => void
}

export function BookThumbnail({ book, link, onClick }: Props) {
  const [cancelProcessing] = useCancelProcessingMutation()

  const Container = link ? Link : Box
  const TextContainer = link ? Link : Text

  return (
    <Box className="group" onClick={link ? undefined : onClick}>
      <Stack gap={2} className="group h-[18.9375rem]">
        <Stack className="relative mb-1 h-[14.0625rem] flex-col justify-center">
          <Container
            href={`/books/${book.uuid}`}
            className="block h-[14.0625rem] w-[9.1875rem]"
          >
            <BookThumbnailImage
              height="14.0625rem"
              width="9.1875rem"
              book={book}
            />
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
          </Container>
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
        </Stack>
        <TextContainer
          href={`/books/${book.uuid}`}
          className="line-clamp-2 max-w-[9.1875rem] bg-white text-sm font-semibold group-hover:line-clamp-none"
        >
          {!!book.readaloud?.filepath && (
            <IconReadaloud className="text-st-orange-600 -mx-1 -mb-2 -mt-3 inline-block h-6 w-6" />
          )}{" "}
          {book.title}
        </TextContainer>
        <TextContainer
          className={cx(
            { "hover:text-st-orange-600 hover:underline": link },
            "max-w-[9.1875rem] bg-white pb-2 text-sm",
          )}
          href={`/books?authors=${book.authors[0]?.uuid}`}
        >
          {book.authors[0]?.name}
        </TextContainer>
      </Stack>
    </Box>
  )
}
