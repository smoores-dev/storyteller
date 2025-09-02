import { readFile } from "node:fs/promises"

import {
  getTranscriptionFilename,
  getTranscriptionsFilepath,
} from "@/assets/paths"
import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

type Params = Promise<{
  uuid: UUID
  filename: string
}>

export const GET = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { uuid, filename } = await context.params
  const book = await getBook(uuid, request.auth.user.id)

  if (!book) {
    return Response.json(
      { message: `Could not find book with id ${uuid}` },
      { status: 404 },
    )
  }

  const transcriptionFilename = getTranscriptionFilename(filename)

  try {
    const transcription = await readFile(
      getTranscriptionsFilepath(book, transcriptionFilename),
      { encoding: "utf-8" },
    )
    return Response.json(transcription)
  } catch {
    return Response.json(
      { message: `Could not find transcription for audio file ${filename}` },
      { status: 404 },
    )
  }
})
