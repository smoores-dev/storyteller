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

function getMigration(hash: string) {
  const db = getDatabase()
  try {
    const row = db
      .prepare<{ hash: string }>(
        `
      SELECT id, hash, name
      FROM migration
      WHERE hash = $hash
      `,
      )
      .get({ hash }) as Migration | undefined
    return row ?? null
  } catch (e) {
    return null
  }
}

function createMigration(hash: string, name: string) {
  const db = getDatabase()
  db.prepare<{ name: string; hash: string }>(
    `
    INSERT INTO migration (hash, name)
    VALUES ($hash, $name)
    `,
  ).run({ hash, name })
}

async function migrateFile(path: string) {
  const db = getDatabase()

  const contents = await readFile(path, {
    encoding: "utf-8",
  })
  const hash = createHash("sha256").update(contents).digest("hex")

  const existingMigration = getMigration(hash)
  if (!existingMigration) {
    console.log(`Running migration: "${basename(path, ".sql")}"\n`)
    console.log(contents)
    const statements = contents
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => !!statement.length)

    for (const statement of statements) {
      db.prepare(statement).run()
    }

    createMigration(hash, basename(path))
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
