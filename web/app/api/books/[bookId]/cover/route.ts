import { withHasPermission } from "@/auth"
import { getBookUuid } from "@/database/books"
import { getAudioCoverFilepath } from "@/process/processAudio"
import { getEpubCoverFilepath } from "@/process/processEpub"
import { UUID } from "@/uuid"
import { open } from "node:fs/promises"
import { NextResponse } from "next/server"
import { basename } from "node:path"

export const dynamic = "force-dynamic"

type Params = {
  bookId: UUID | string
}

export const GET = withHasPermission<Params>("book_read")(async (
  request,
  context,
) => {
  const bookUuid = await getBookUuid(context.params.bookId)
  const audio = typeof request.nextUrl.searchParams.get("audio") === "string"

  const coverFilepath = audio
    ? await getAudioCoverFilepath(bookUuid)
    : await getEpubCoverFilepath(bookUuid)

  if (!coverFilepath) {
    return NextResponse.json(
      { message: `Could not find book with id ${context.params.bookId}` },
      { status: 404 },
    )
  }

  const file = await open(coverFilepath)

  // @ts-expect-error NextResponse handles Node Streams just fine
  return new NextResponse(file.createReadStream(), {
    headers: {
      "Content-Disposition": `attachment; filename="${basename(coverFilepath)}"`,
    },
  })
})
