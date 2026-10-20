import { createHash, randomUUID } from "node:crypto"
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { promisify } from "node:util"
import * as v8 from "node:v8"
import {
  type BrotliOptions,
  brotliCompress,
  brotliDecompress,
  constants,
} from "node:zlib"

import { Epub, MemoryAdapter } from "@storyteller-platform/epub"

import { type BookWithRelations } from "@/database/books.ts"
import { CACHE_DIR } from "@/directories.ts"
import { logger } from "@/logging.ts"
import { type OverlayIndex, readOverlayIndex } from "@/progress/overlayIndex.ts"

const compress = promisify(brotliCompress)
const decompress = promisify(brotliDecompress)

const COMPRESSION: BrotliOptions = {
  params: {
    [constants.BROTLI_PARAM_QUALITY]: 5,
  },
}

/** Bumping this invalidates every persisted index, so they are rebuilt. */
const FORMAT_VERSION = 1

const OVERLAYS_DIR = join(CACHE_DIR, "overlays")

export async function getOverlayIndex(
  book: BookWithRelations,
): Promise<OverlayIndex | null> {
  const readaloud = book.readaloud

  if (
    !readaloud ||
    readaloud.status !== "ALIGNED" ||
    readaloud.missing ||
    !readaloud.filepath
  ) {
    return null
  }

  const path = cacheFilepath(readaloud.uuid, readaloud.fingerprint)

  const persisted = await readIndex(path)
  if (persisted) return persisted

  const index = await build(readaloud.filepath)
  if (!index) return null

  await writeIndex(path, index)
  await removeStaleIndexes(readaloud.uuid, path)

  return index
}

async function build(filepath: string): Promise<OverlayIndex | null> {
  try {
    using epub = await Epub.using(MemoryAdapter).from(filepath)

    return await readOverlayIndex(epub)
  } catch (error) {
    logger.error({
      err: error,
      msg: `Could not read the media overlays of ${filepath}`,
    })

    return null
  }
}

function cacheFilepath(uuid: string, fingerprint: string | null): string {
  const identity = createHash("sha256")
    .update(fingerprint ?? "unknown")
    .digest("hex")
    .slice(0, 16)

  return join(OVERLAYS_DIR, `${uuid}-v${FORMAT_VERSION}-${identity}.bin`)
}

async function readIndex(path: string): Promise<OverlayIndex | null> {
  let raw: Buffer

  try {
    raw = await readFile(path)
  } catch {
    return null
  }

  try {
    return asOverlayIndex(v8.deserialize(await decompress(raw)))
  } catch (error) {
    logger.warn({
      err: error,
      msg: `Could not read the persisted media overlays at ${path}, rebuilding`,
    })

    return null
  }
}

function asOverlayIndex(value: unknown): OverlayIndex {
  if (typeof value !== "object" || value === null) {
    throw new Error("The persisted media overlays are not an overlay index")
  }

  const index = value as OverlayIndex

  if (
    !Array.isArray(index.audioHrefPathnames) ||
    typeof index.anchors !== "string" ||
    !(index.audioFileStarts instanceof Int32Array) ||
    !(index.anchorStart instanceof Int32Array) ||
    !(index.byAnchor instanceof Int32Array) ||
    !(index.times instanceof Float64Array) ||
    index.times.length / 2 !== index.byAnchor.length ||
    index.anchorStart.length !== index.byAnchor.length + 1
  ) {
    throw new Error("The persisted media overlays are not an overlay index")
  }

  return index
}

async function writeIndex(path: string, index: OverlayIndex): Promise<void> {
  try {
    const raw = await compress(v8.serialize(index), COMPRESSION)

    await mkdir(dirname(path), { recursive: true })

    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporary, raw)
    await rename(temporary, path)
  } catch (error) {
    logger.warn({
      err: error,
      msg: `Could not persist the media overlays to ${path}`,
    })
  }
}

async function removeStaleIndexes(uuid: string, path: string): Promise<void> {
  const keeping = basename(path)
  const directory = dirname(path)

  try {
    const siblings = await readdir(directory)

    await Promise.all(
      siblings
        .filter((sibling) => sibling !== keeping)
        .filter((sibling) => sibling.startsWith(`${uuid}-`))
        .map((sibling) => rm(join(directory, sibling), { force: true })),
    )
  } catch (error) {
    logger.debug({
      err: error,
      msg: `Could not clean out superseded media overlays beside ${path}`,
    })
  }
}
