import { readFile } from "node:fs/promises"

import { getAlignmentReportFilepath } from "@/assets/paths"
import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

type Params = Promise<{
  uuid: UUID
}>

export const GET = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { uuid } = await context.params
  const book = await getBook(uuid, request.auth.user.id)
  if (!book) {
    return Response.json(
      { message: `Could not find book with id ${uuid}` },
      { status: 404 },
    )
  }

  try {
    const report = await readFile(getAlignmentReportFilepath(book), {
      encoding: "utf-8",
    })
    return Response.json(report)
  } catch {
    return Response.json({
      message: `Could not find report for book with id ${uuid}`,
    })
  }
})
