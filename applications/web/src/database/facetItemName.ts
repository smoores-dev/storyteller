import { sql } from "kysely"

import { type FacetSection } from "@/facet-sections"
import { type UUID } from "@/uuid"

import { db } from "./connection"

export async function getFacetItemName(
  section: FacetSection,
  key: string,
): Promise<string | null> {
  switch (section) {
    case "tags": {
      const row = await db
        .selectFrom("tag")
        .select("name")
        .where("uuid", "=", key as UUID)
        .executeTakeFirst()
      return row?.name ?? null
    }
    case "series": {
      const row = await db
        .selectFrom("series")
        .select("name")
        .where("uuid", "=", key as UUID)
        .executeTakeFirst()
      return row?.name ?? null
    }
    case "authors":
    case "narrators":
    case "translators": {
      const row = await db
        .selectFrom("creator")
        .select("name")
        .where("uuid", "=", key as UUID)
        .executeTakeFirst()
      return row?.name ?? null
    }
    case "statuses": {
      const row = await db
        .selectFrom("status")
        .select(sql<string>`coalesce(status.label, status.name)`.as("name"))
        .where("uuid", "=", key as UUID)
        .executeTakeFirst()
      return row?.name ?? null
    }
    case "identifiers": {
      const row = await db
        .selectFrom("identifierType")
        .select("name")
        .where("uuid", "=", key as UUID)
        .executeTakeFirst()
      return row?.name ?? null
    }
    case "publicationYears":
      return key
    default:
      return null
  }
}
