import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getDistinctBookFieldValues } from "@/database/books"
import { isDistinctFacetField } from "@/fields"

export const GET = withHasPermission("bookList")(async (request) => {
  const field = request.nextUrl.searchParams.get("field")

  if (!field || !isDistinctFacetField(field)) {
    return NextResponse.json(
      { message: `Unknown distinct field: ${field ?? ""}` },
      { status: 400 },
    )
  }

  const values = await getDistinctBookFieldValues(field)
  return NextResponse.json(values)
})
