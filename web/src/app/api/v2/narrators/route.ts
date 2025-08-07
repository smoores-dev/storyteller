import { withHasPermission } from "@/auth/auth"
import { getNarrators } from "@/database/narrators"
import { NextResponse } from "next/server"

/**
 * @summary List all narrators
 * @desc '
 */
export const GET = withHasPermission("bookList")(async () => {
  const narrators = await getNarrators()

  return NextResponse.json(narrators)
})
