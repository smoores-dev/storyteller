import { Anchor, Stack, Text, Title } from "@mantine/core"
import { IconArrowNarrowLeft } from "@tabler/icons-react"
import { type Metadata } from "next"
import Link from "next/link"

import { fetchApiRoute } from "@/app/fetchApiRoute"
import { assertHasPermission } from "@/auth/auth"
import { BookEditForm } from "@/components/books/edit/BookEditForm"
import { type BookWithRelations } from "@/database/books"

type Props = {
  params: Promise<{
    uuid: string
  }>
}

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { uuid } = await params
  const book = await fetchApiRoute<BookWithRelations>(`/books/${uuid}`)
  return {
    title: `✏️ ${book.title} | Books`,
  }
}

export default async function BookEditPage(props: Props) {
  const params = await props.params

  const { uuid } = params

  const book = await fetchApiRoute<BookWithRelations>(`/books/${uuid}`)
  await assertHasPermission("bookUpdate")

  return (
    <Stack gap={24}>
      <Anchor
        component={Link}
        href={`/books/${uuid}`}
        className="flex items-center gap-2"
      >
        <IconArrowNarrowLeft size={20} /> Back
      </Anchor>
      <Title order={2}>{book.title}</Title>
      {(book.alignedAt ||
        book.alignedWith ||
        book.alignedByStorytellerVersion) && (
        <Stack className="rounded bg-gray-100 p-4">
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
      )}
      <BookEditForm book={book} />
    </Stack>
  )
}
