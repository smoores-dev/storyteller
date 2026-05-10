import { type UUID } from "@/uuid"

import { db } from "./connection"

export async function addImportSkipPaths(
  paths: { bookUuid: UUID; filepath: string }[],
) {
  if (!paths.length) return
  return db
    .insertInto("importSkipPath")
    .values(paths)
    .onConflict((oc) => oc.column("filepath").doNothing())
    .execute()
}

export async function removeImportSkipPaths(paths: string[]) {
  return db
    .deleteFrom("importSkipPath")
    .where("filepath", "in", paths)
    .execute()
}

export async function getImportSkipPaths() {
  return db.selectFrom("importSkipPath").select("filepath").execute()
}
