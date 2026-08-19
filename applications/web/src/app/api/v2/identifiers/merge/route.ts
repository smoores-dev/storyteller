import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { db } from "@/database/connection"
import { mergeIdentifierTypes } from "@/database/identifiers"
import { type UUID } from "@/uuid"

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const { targetUuid, sourceUuids } = (await request.json()) as {
    targetUuid: UUID
    sourceUuids: UUID[]
  }

  if (!sourceUuids.length) {
    return new Response(null, { status: 204 })
  }

  const builtins = await db
    .selectFrom("identifierType")
    .select("uuid")
    .where("uuid", "in", sourceUuids)
    .where("kind", "is not", null)
    .execute()

  if (builtins.length) {
    return NextResponse.json(
      { message: "Cannot merge away a built-in identifier" },
      { status: 400 },
    )
  }

  await mergeIdentifierTypes(targetUuid, sourceUuids)
  return new Response(null, { status: 204 })
})
