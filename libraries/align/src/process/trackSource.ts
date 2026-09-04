import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
} from "node:path"

export interface TrackSource {
  source: string
  sourceSize: number
  start: number
  end: number
}

export function getTrackSourceFilepath(audioFilepath: string) {
  const name = basename(audioFilepath, extname(audioFilepath))
  return join(dirname(audioFilepath), `${name}.source.json`)
}

export async function describeTrackSource(
  root: string,
  filepath: string,
  start: number,
  end: number,
): Promise<TrackSource> {
  const { size } = await stat(filepath)
  const rel = relative(root, filepath)
  const source =
    rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : basename(filepath)
  return { source, sourceSize: size, start, end }
}

export async function writeTrackSource(
  audioFilepath: string,
  source: TrackSource,
) {
  await writeFile(
    getTrackSourceFilepath(audioFilepath),
    JSON.stringify(source),
    {
      encoding: "utf-8",
    },
  )
}

export async function readTrackSource(
  audioFilepath: string,
): Promise<TrackSource | null> {
  try {
    const raw = await readFile(getTrackSourceFilepath(audioFilepath), {
      encoding: "utf-8",
    })
    return JSON.parse(raw) as TrackSource
  } catch {
    return null
  }
}

export async function pruneStaleOutputs(
  outputDir: string,
  audioFilenames: string[],
) {
  const expected = new Set(audioFilenames.map((f) => basename(f, extname(f))))
  const existing = await readdir(outputDir)
  await Promise.all(
    existing
      .filter((f) => !expected.has(basename(f, extname(f))))
      .map((f) => rm(join(outputDir, f), { force: true })),
  )
}
