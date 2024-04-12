import { CACHE_DIR } from "@/directories"
import { UUID } from "@/uuid"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export function getSyncCachePath(bookUuid: UUID) {
  return join(CACHE_DIR, `${bookUuid}.json`)
}

export async function getSyncCache(bookUuid: UUID) {
  const filepath = getSyncCachePath(bookUuid)
  return SyncCache.init(filepath)
}

type SerializedCache = {
  chapter_index: Record<
    number,
    { start_sentence: number; transcription_offset: number | null }
  >
}

export class SyncCache {
  private constructor(
    private filepath: string,
    private data: SerializedCache,
  ) {}

  static async init(filepath: string) {
    let contents: string
    try {
      contents = await readFile(filepath, { encoding: "utf-8" })
    } catch (_) {
      contents = '{"chapter_index": {}}'
    }
    const data = JSON.parse(contents)
    return new SyncCache(filepath, data)
  }

  getChapterIndex(chapter: number) {
    const existing = this.data.chapter_index[chapter]
    if (!existing) return null
    return {
      startSentence: existing.start_sentence,
      transcriptionOffset: existing.transcription_offset,
    }
  }

  async setChapterIndex(
    chapter: number,
    update: { startSentence: number; transcriptionOffset: number | null },
  ) {
    this.data.chapter_index[chapter] = {
      start_sentence: update.startSentence,
      transcription_offset: update.transcriptionOffset,
    }
    await writeFile(this.filepath, JSON.stringify(this.data))
  }
}
