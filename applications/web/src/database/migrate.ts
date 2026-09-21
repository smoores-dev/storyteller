import { createHash } from "node:crypto"
import { existsSync, mkdirSync } from "node:fs"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { cwd } from "node:process"

import { splitQuery, sqliteSplitterOptions } from "dbgate-query-splitter"
import { sql } from "kysely"

import { BACKUP_DIR, DB_DIR } from "@/directories"
import { env } from "@/env"
import { logger } from "@/logging"
import { getCurrentVersion } from "@/versions"

import { backupDatabase, db } from "./connection"

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
  "47_restructure_creators.sql": (
    await import("./migrations/47_restructure_creators.sql")
  ).default,
  "53_pre_extract_cover_art.sql": (
    await import("./migrations/53_pre_extract_cover_art.sql")
  ).default,
  "59_migrate_hrefs.sql": (await import("./migrations/59_migrate_hrefs.sql"))
    .default,
  "72_add_scan_pipeline.sql": (
    await import("./migrations/72_add_scan_pipeline.sql")
  ).default,
  "73_schema_cleanup.sql": (await import("./migrations/73_schema_cleanup.sql"))
    .default,
  "74_normalize_import_paths.sql": (
    await import("./migrations/74_normalize_import_paths.sql")
  ).default,
  "75_import_rules.sql": (await import("./migrations/75_import_rules.sql"))
    .default,
  "76_metadata_override_merge.sql": (
    await import("./migrations/76_metadata_override_merge.sql")
  ).default,
  "77_importrule_source.sql": (
    await import("./migrations/77_importrule_source.sql")
  ).default,
  "78_asset_dir.sql": (await import("./migrations/78_asset_dir.sql")).default,
  "80_import_rule_epub2_strategy.sql": (
    await import("./migrations/80_import_rule_epub2_strategy.sql")
  ).default,
  "73_add_cover_colors_blurhash.sql": (
    await import("./migrations/73_add_cover_colors_blurhash.sql")
  ).default,
  "85_shelves.sql": (await import("./migrations/85_shelves.sql")).default,
  "89_sidebar_groups_icons.sql": (
    await import("./migrations/89_sidebar_groups_icons.sql")
  ).default,
  "91_dedupe_book_collections.sql": (
    await import("./migrations/91_dedupe_book_collections.sql")
  ).default,
  "93_add_formats_sidebar.sql": (
    await import("./migrations/93_add_formats_sidebar.sql")
  ).default,
  "95_alignment_reports.sql": (
    await import("./migrations/95_alignment_reports.sql")
  ).default,
  "96_alignment_summary_on_report.sql": (
    await import("./migrations/96_alignment_summary_on_report.sql")
  ).default,
  "101_dedupe_book_series.sql": (
    await import("./migrations/101_dedupe_book_series.sql")
  ).default,
  "102_book_cover_colors_override.sql": (
    await import("./migrations/102_book_cover_colors_override.sql")
  ).default,
  "104_sidebar_group_kind.sql": (
    await import("./migrations/104_sidebar_group_kind.sql")
  ).default,
  "105_v2_reconcile.sql": (await import("./migrations/105_v2_reconcile.sql"))
    .default,
  "107_unify_format_filter.sql": (
    await import("./migrations/107_unify_format_filter.sql")
  ).default,
  "110_images.sql": (await import("./migrations/110_images.sql")).default,
  "111_server_identity.sql": (
    await import("./migrations/111_server_identity.sql")
  ).default,
  "112_encrypt_secrets.sql": (
    await import("./migrations/112_encrypt_secrets.sql")
  ).default,
  "115_alignment_overrides_ignored.sql": (
    await import("./migrations/115_alignment_overrides_ignored.sql")
  ).default,
  "116_normalize_aligned_at.sql": (
    await import("./migrations/116_normalize_aligned_at.sql")
  ).default,
  "117_alignment_coverage_columns.sql": (
    await import("./migrations/117_alignment_coverage_columns.sql")
  ).default,
  "120_alignment_decisions.sql": (
    await import("./migrations/120_alignment_decisions.sql")
  ).default,
  "121_regrade_alignment_reports.sql": (
    await import("./migrations/121_regrade_alignment_reports.sql")
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

async function migrateFile(path: string) {
  const contents = await readFile(path, {
    encoding: "utf-8",
  })
  const hash = createHash("sha256").update(contents).digest("hex")

  const existingMigration = await getMigration(hash)
  if (existingMigration) return null
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

  return hash
}

const BACKUP_MARKER = join(DB_DIR, ".startup-backup-done")

async function backupOnce(foundFirstStartup: boolean) {
  if (foundFirstStartup) return
  if (existsSync(BACKUP_MARKER)) return

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const destPath = join(
    BACKUP_DIR,
    `storyteller-pre-v3-${getCurrentVersion()}-${stamp}.db`,
  )

  try {
    mkdirSync(BACKUP_DIR, { recursive: true })
    await backupDatabase(destPath)
    await writeFile(BACKUP_MARKER, `${destPath}\n`, { encoding: "utf-8" })
    logger.info(`Created one-time safety backup of the database at ${destPath}`)
  } catch (err) {
    if (env.STORYTELLER_SKIP_STARTUP_BACKUP) {
      logger.warn({
        err,
        msg: "Could not create the startup safety backup, continuing anyway because STORYTELLER_SKIP_STARTUP_BACKUP is set",
      })
      return
    }
    logger.error(
      "Could not create the startup safety backup of the database. Refusing to start so your data is not migrated without a backup. Set STORYTELLER_SKIP_STARTUP_BACKUP=true to bypass this.",
    )
    throw err
  }
}

export async function migrate() {
  // Make sure to evaluate this _before_ running any migrations
  const foundFirstStartup = await isFirstStartup()
  if (foundFirstStartup) logger.info("First startup - initializing database")

  await backupOnce(foundFirstStartup)

  const migrationsDir = join(cwd(), "migrations")
  const migrationFiles = await readdir(migrationsDir)
  migrationFiles.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )

  for (const migrationFile of migrationFiles.filter(
    (f) => extname(f) === ".sql",
  )) {
    const hash = await migrateFile(join(migrationsDir, migrationFile))

    if (hash) {
      await jsMigrations[migrationFile]?.()
      await createMigration(hash, migrationFile)
    }
  }

  if (foundFirstStartup && env.STORYTELLER_INITIAL_AUDIO_CODEC) {
    await setInitialAudioCodec(env.STORYTELLER_INITIAL_AUDIO_CODEC)
  }
}

// Support running directly as a script, for dev/testing
if (process.argv[1] === import.meta.filename) {
  void migrate()
}
