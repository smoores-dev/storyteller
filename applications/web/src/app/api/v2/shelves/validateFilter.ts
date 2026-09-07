import { NextResponse } from "next/server"
import { z } from "zod"

import {
  type ShelfFilter,
  type ShelfFilterIssue,
  collectFilterIssues,
  describeFilterIssue,
  shelfFilterSchema,
} from "@/shelves"

export function invalidFilterResponse(issues: ShelfFilterIssue[]) {
  return NextResponse.json(
    {
      message: `Invalid filter: ${issues.map(describeFilterIssue).join(". ")}`,
      issues,
    },
    { status: 400 },
  )
}

export function validateFilter(
  raw: unknown,
): { ok: true; filter: ShelfFilter } | { ok: false; response: NextResponse } {
  const issues = collectFilterIssues(raw)
  if (issues.length > 0) {
    return { ok: false, response: invalidFilterResponse(issues) }
  }

  const validated = shelfFilterSchema.safeParse(raw)
  if (!validated.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: `Invalid filter: ${z.prettifyError(validated.error)}` },
        { status: 400 },
      ),
    }
  }

  return { ok: true, filter: validated.data }
}
