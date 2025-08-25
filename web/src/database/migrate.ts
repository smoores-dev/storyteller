import { basename, extname, join } from "node:path"
import { db } from "./connection"
import { cwd } from "node:process"
import { readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { logger } from "@/logging"
import { splitQuery, sqliteSplitterOptions } from "dbgate-query-splitter"
import { sql } from "kysely"

const jsMigrations: Record<string, () => Promise<void>> = {
  "33_add_more_book_metadata.sql": (
    await import("./migrations/33_add_more_book_metadata.sql")
  ).default,
  "38_split_book_tables.sql": (
    await import("./migrations/38_split_book_tables.sql")
  ).default,
  "39_reorganize_library.sql": (
    await import("./migrations/39_reorganize_library.sql")
  ).default,
  "45_generate_image_thumbnails.sql": (
    await import("./migrations/45_generate_image_thumbnails.sql")
  ).default,
  "47_restructure_creators.sql": (
    await import("./migrations/47_restructure_creators.sql")
  ).default,
  "53_pre_extract_cover_art.sql": (
    await import("./migrations/53_pre_extract_cover_art.sql")
  ).default,
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

  // Foreign keys can't be disabled within a transaction,
  // so we have to run these outside the transaction
  if (contents.includes("PRAGMA foreign_keys = 0;")) {
    await sql`PRAGMA foreign_keys = 0`.execute(db)
  }

  await db.transaction().execute(async (tr) => {
    for (const statement of statements) {
      try {
        await sql`${sql.raw(statement)}`.execute(tr)
      } catch (e) {
        logger.error(`Failed to run statement:
${statement}`)
        throw e
      }
    }
  })

  if (contents.includes("PRAGMA foreign_keys = 1;")) {
    await sql`PRAGMA foreign_keys = 1`.execute(db)
  }

  await createMigration(hash, basename(path))
  return true
}

export async function migrate() {
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
      await jsMigrations[migrationFile]?.()
    }
  }

  if (foundFirstStartup && initialCodec) {
    await setInitialAudioCodec(initialCodec)
  }
}

// Support running directly as a script, for dev/testing
if (process.argv[1] === import.meta.filename) {
  void migrate()
}
