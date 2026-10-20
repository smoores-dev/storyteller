import assert from "node:assert"
import { readdir } from "node:fs/promises"
import { join } from "node:path"

import { type AudiobookInputs } from "@storyteller-platform/audiobook"
import { isHiddenFile } from "@storyteller-platform/fs"

import { isAudioFile } from "@/audio.ts"

export async function getAudiobookTracks(
  directory: string,
): Promise<AudiobookInputs> {
  const entries = await readdir(directory, { recursive: true })
  const tracks = entries
    .filter((entry) => isAudioFile(entry) && !isHiddenFile(entry))
    .map((entry) => join(directory, entry))
    .toSorted((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true })
    })

  const [first, ...rest] = tracks
  assert(
    first,
    `Audiobook at ${directory} expected to have at least one audio file.`,
  )

  return [first, ...rest]
}
