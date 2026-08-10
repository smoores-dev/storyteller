import { readFile, readdir } from "node:fs/promises"
import { extname, join } from "node:path"

import { sql } from "kysely"

import { getSafeFilepathSegment } from "@/assets/paths"
import { db } from "@/database/connection"
import { type StoredCoverColor } from "@/database/coverColors"
import { ASSETS_DIR } from "@/directories"
import { ingestImage } from "@/images"
import { logger } from "@/logging"

const COVER_EXTENSIONS = [".jpeg", ".jpg", ".png", ".svg", ".webp", ".avif"]

const COVER_DIRECTORIES = {
  ebook: "ebook cover",
  readaloud: "ebook cover",
  audiobook: "audiobook cover",
} as const

type Format = keyof typeof COVER_DIRECTORIES

type CoverRow = {
  bookUuid: string
  fingerprint: string | null
  coverBlurhash: string | null
  coverColors: StoredCoverColor[] | null
  assetDir: string | null
  title: string
}

async function findCoverFile(bookDirectory: string, format: Format) {
  const directory = join(bookDirectory, COVER_DIRECTORIES[format])

  try {
    const entries = await readdir(directory)
    const entry = entries.find((name) =>
      COVER_EXTENSIONS.includes(extname(name).toLowerCase()),
    )
    if (!entry) return null

    return { path: join(directory, entry), filename: entry }
  } catch {
    return null
  }
}

async function backfillFormat(format: Format) {
  const table = sql.table(format)

  const { rows } = await sql<CoverRow>`
    SELECT
      f.book_uuid,
      f.fingerprint,
      f.cover_blurhash,
      f.cover_colors,
      b.asset_dir,
      b.title
    FROM ${table} f
    INNER JOIN book b ON b.uuid = f.book_uuid
    WHERE f.cover_image_uuid IS NULL
  `.execute(db)

  let attached = 0

  for (const row of rows) {
    const bookDirectory = join(
      ASSETS_DIR,
      row.assetDir || getSafeFilepathSegment(row.title),
    )

    const cover = await findCoverFile(bookDirectory, format)
    if (!cover) continue

    try {
      const data = await readFile(cover.path)
      const image = await ingestImage(data, {
        sourceName: cover.filename,
        derived: {
          blurhash: row.coverBlurhash,
          colors: row.coverColors,
        },
      })
      if (!image) continue

      await sql`
        UPDATE ${table}
        SET
          cover_image_uuid = ${image.uuid},
          cover_origin = 'extracted',
          cover_extracted_from = ${row.fingerprint}
        WHERE book_uuid = ${row.bookUuid}
      `.execute(db)

      attached += 1
      if (attached % 100 === 0) {
        logger.info(
          `Migrated ${attached} ${format} covers into the image store`,
        )
      }
    } catch (err) {
      logger.warn({
        err,
        msg: `Could not migrate the ${format} cover at ${cover.path}, leaving it in place`,
      })
    }
  }

  return attached
}

export default async function migrate() {
  let total = 0

  for (const format of Object.keys(COVER_DIRECTORIES) as Format[]) {
    total += await backfillFormat(format)
  }

  if (total > 0) {
    logger.info(
      `Migrated ${total} covers into the image store. The originals were copied, not moved, and remain in the library.`,
    )
  }
}
