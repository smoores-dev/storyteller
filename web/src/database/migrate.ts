import { basename, join } from "node:path"
import { getDatabase } from "./connection"
import { cwd } from "node:process"
import { readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { logger } from "@/logging"

type Migration = {
  id: number
  hash: string
  name: string
}

function isFirstStartup() {
  const db = getDatabase()
  try {
    const row = db
      .prepare(
        `
SELECT COUNT(*) as migration_count
FROM migration
`,
      )
      .get() as { migration_count: number }
    return row.migration_count === 0
  } catch {
    return true
  }
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

function setInitialAudioCodec(options: {
  codec: string
  bitrate: string | undefined
}) {
  const db = getDatabase()
  db.prepare<{ codec: string }>(
    `
    UPDATE settings
    SET value = $codec
    WHERE name = 'codec';
    `,
  ).run({
    codec:
      options.codec === "opus"
        ? "libopus"
        : options.codec === "mp3"
          ? "libmp3lame"
          : "acc",
  })

  if (options.bitrate) {
    db.prepare<{ bitrate: string }>(
      `
      UPDATE settings
      SET value = $bitrate
      WHERE name = 'bitrate';
      `,
    ).run({
      bitrate: options.bitrate,
    })
  }
}

function getInitialAudioCodec() {
  const env = process.env["STORYTELLER_INITIAL_AUDIO_CODEC"]
  if (!env) return null
  const match = env.match(/^(mp3|aac|opus)(?:-(16|24|32|64|96))?$/)
  if (!match?.[1]) return null
  return { codec: match[1], bitrate: match[2] }
}

async function migrateFile(path: string) {
  const db = getDatabase()

  const contents = await readFile(path, {
    encoding: "utf-8",
  })
  const hash = createHash("sha256").update(contents).digest("hex")

  const existingMigration = getMigration(hash)
  if (!existingMigration) {
    logger.info(`Running migration: "${basename(path, ".sql")}"\n`)
    logger.info(contents)
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
  // Make sure to evaluate this _before_ running any migrations
  const foundFirstStartup = isFirstStartup()
  if (foundFirstStartup) logger.info("First startup - initializing database")

  const initialCodec = getInitialAudioCodec()

  const migrationsDir = join(cwd(), "migrations")
  const migrationFiles = await readdir(migrationsDir)
  migrationFiles.sort()

  // We have to special case the "zero-th" migration,
  // because we goofed and didn't add it as a migration
  // until after the first migration.
  for (const migrationFile of migrationFiles) {
    await migrateFile(join(migrationsDir, migrationFile))
  }

  if (foundFirstStartup && initialCodec) {
    setInitialAudioCodec(initialCodec)
  }
}

void migrate()
