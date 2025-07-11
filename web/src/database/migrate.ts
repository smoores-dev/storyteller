import { basename, extname, join } from "node:path"
import { db } from "./connection"
import { cwd } from "node:process"
import { readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { logger } from "@/logging"
import { splitQuery, sqliteSplitterOptions } from "dbgate-query-splitter"
import { sql } from "kysely"

const jsMigrations: Record<string, Promise<() => Promise<void>>> = {
  "33_add_more_book_metadata.sql": import(
    "./migrations/33_add_more_book_metadata.sql"
  ).then((m) => m.default),
  "40_split_book_tables.sql": import(
    "./migrations/40_split_book_tables.sql"
  ).then((m) => m.default),
  "41_reorganize_library.sql": import(
    "./migrations/41_reorganize_library.sql"
  ).then((m) => m.default),
}

async function isFirstStartup() {
  try {
    const rows = await db
      .selectFrom("migration")
      .select([({ fn }) => fn.count("migration.id").as("migrationCount")])
      .execute()

    return rows[0]?.migrationCount === 0
  } catch {
    return true
  }
}

async function getMigration(hash: string) {
  try {
    const [row] = await db
      .selectFrom("migration")
      .select("hash")
      .where("hash", "=", hash)
      .execute()
    return row ?? null
  } catch {
    return null
  }
}

async function createMigration(hash: string, name: string) {
  await db.insertInto("migration").values({ name, hash }).execute()
}

async function setInitialAudioCodec(options: {
  codec: string
  bitrate: string | undefined
}) {
  await db
    .updateTable("settings")
    .set({
      value: JSON.stringify(
        options.codec === "opus"
          ? "libopus"
          : options.codec === "mp3"
            ? "libmp3lame"
            : "acc",
      ),
    })
    .where("name", "=", "codec")
    .execute()

  if (options.bitrate) {
    await db
      .updateTable("settings")
      .set({ value: JSON.stringify(options.bitrate) })
      .where("name", "=", "bitrate")
      .execute()
  }
}

function getInitialAudioCodec() {
  const env = process.env["STORYTELLER_INITIAL_AUDIO_CODEC"]
  if (!env) return null
  const match = env.match(/^(mp3|aac|opus)(?:-(16|24|32|64|96))?$/)
  if (!match?.[1]) return null
  return { codec: match[1], bitrate: match[2] && `${match[2]}k` }
}

async function migrateFile(path: string) {
  const contents = await readFile(path, {
    encoding: "utf-8",
  })
  const hash = createHash("sha256").update(contents).digest("hex")

  const existingMigration = await getMigration(hash)
  if (existingMigration) return false
  logger.info(hash)
  logger.info(`Running migration: "${basename(path, ".sql")}"\n`)
  logger.info(contents)
  const statements = splitQuery(contents, sqliteSplitterOptions) as string[]

  for (const statement of statements) {
    try {
      await sql`${sql.raw(statement)}`.execute(db)
    } catch (e) {
      logger.error(`Failed to run statement:
${statement}`)
      throw e
    }
  }

  await createMigration(hash, basename(path))
  return true
}

async function migrate() {
  // Make sure to evaluate this _before_ running any migrations
  const foundFirstStartup = await isFirstStartup()
  if (foundFirstStartup) logger.info("First startup - initializing database")

  const initialCodec = getInitialAudioCodec()

  const migrationsDir = join(cwd(), "migrations")
  const migrationFiles = await readdir(migrationsDir)
  migrationFiles.sort()

  for (const migrationFile of migrationFiles.filter(
    (f) => extname(f) === ".sql",
  )) {
    const migrated = await migrateFile(join(migrationsDir, migrationFile))

    if (migrated) {
      if (jsMigrations[migrationFile]) {
        const jsMigration = await jsMigrations[migrationFile]
        await jsMigration()
      }
    }
  }

  if (foundFirstStartup && initialCodec) {
    await setInitialAudioCodec(initialCodec)
  }
}

void migrate()
