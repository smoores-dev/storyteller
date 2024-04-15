import { basename, join } from "node:path"
import { getDatabase } from "./connection"
import { cwd } from "node:process"
import { readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"

type Migration = {
  id: number
  hash: string
  name: string
}

async function getMigration(hash: string) {
  const db = await getDatabase()
  try {
    const row = await db.get<Migration | undefined>(
      `
      SELECT id, hash, name
      FROM migration
      WHERE hash = $hash
      `,
      { $hash: hash },
    )
    return row ?? null
  } catch (e) {
    return null
  }
}

async function createMigration(hash: string, name: string) {
  const db = await getDatabase()
  await db.run(
    `
    INSERT INTO migration (hash, name)
    VALUES ($hash, $name)
    `,
    { $hash: hash, $name: name },
  )
}

async function migrateFile(path: string) {
  const db = await getDatabase()

  const contents = await readFile(path, {
    encoding: "utf-8",
  })
  const hash = createHash("sha256").update(contents).digest("hex")

  const existingMigration = await getMigration(hash)
  if (!existingMigration) {
    const statements = contents
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => !!statement.length)

    for (const statement of statements) {
      await db.run(statement)
    }

    await createMigration(hash, basename(path))
  }
}

async function migrate() {
  const migrationsDir = join(cwd(), "migrations")
  const migrationFiles = await readdir(migrationsDir)
  migrationFiles.sort()

  // We have to special case the "zero-th" migration,
  // because we goofed and didn't add it as a migration
  // until after the first migration.
  for (const migrationFile of migrationFiles) {
    await migrateFile(join(migrationsDir, migrationFile))
  }
}

void migrate()
