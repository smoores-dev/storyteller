import { NextResponse } from "next/server"

import { nodekitErrorResponse } from "@/app/api/v2/metadata/nodekitErrors"
import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { applyMetadataImport } from "@/metadataImport"
import { MetadataImportRequestSchema } from "@/metadataImportTypes"
import { queueWritesToFiles } from "@/writeToFiles/fileWriteDistributor"

export const dynamic = "force-dynamic"

type Params = Promise<{ bookId: string }>

export const POST = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  const parsed = MetadataImportRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Invalid metadata import request",
        issues: parsed.error.issues,
      },
      { status: 400 },
    )
  }

  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return NextResponse.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  try {
    const updated = await applyMetadataImport(
      book,
      parsed.data,
      request.auth.user.id,
    )
    void queueWritesToFiles(book.uuid)
    return NextResponse.json(updated)
  } catch (error) {
    return nodekitErrorResponse(error)
  }
})
