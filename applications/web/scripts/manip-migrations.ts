/* eslint-disable no-console */
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { cwd } from "node:process"

import { db } from "@/database/connection"

const [action, migrationName] = process.argv.slice(2)

const isInvalid = !migrationName || (action !== "apply" && action !== "unapply")

if (isInvalid) {
  console.error("usage: manip-migrations <apply|unapply> <migration_filename>")
  process.exit(1)
}

const filename = migrationName.endsWith(".sql")
  ? migrationName
  : `${migrationName}.sql`

if (action === "apply") {
  const path = join(cwd(), "migrations", filename)
  const contents = await readFile(path, { encoding: "utf-8" })
  const hash = createHash("sha256").update(contents).digest("hex")

  const existing = await db
    .selectFrom("migration")
    .select("hash")
    .where("hash", "=", hash)
    .executeTakeFirst()

  if (existing) {
    console.log(`migration "${filename}" is already marked as applied`)
    process.exit(0)
  }

  await db.insertInto("migration").values({ name: filename, hash }).execute()
  console.log(`marked "${filename}" as applied`)
}

if (action === "unapply") {
  const result = await db
    .deleteFrom("migration")
    .where("name", "=", filename)
    .executeTakeFirst()

  const deleted = Number(result.numDeletedRows)

  if (deleted === 0) {
    console.log(`no applied migration found with name "${filename}"`)
    process.exit(0)
  }

  console.log(`removed "${filename}" from applied migrations`)
}
