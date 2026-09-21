export const PCM_SAMPLE_RATE = 16000

const SEEK_PRE_ROLL = 3200

const SEEK_POST_ROLL = 640

export interface Grid {
  windowSamples: number
  windowsPerChunk: number
}

export interface SourceInfo {
  path: string
  durationSeconds: number
  seekable: boolean
}

export interface ChunkRequest {
  index: number
  source: number
  path: string
  decodeStart: number
  decodeEnd: number | null
  keepStart: number
  keepEnd: number | null
  last: boolean
}

export function planChunks(sources: SourceInfo[], grid: Grid): ChunkRequest[] {
  const span = grid.windowSamples * grid.windowsPerChunk
  if (span <= 0) {
    throw new Error("A chunk must hold at least one sample")
  }

  const chunks: ChunkRequest[] = []
  for (const [source, info] of sources.entries()) {
    const total = Math.round(info.durationSeconds * PCM_SAMPLE_RATE)
    const count = info.seekable ? Math.max(1, Math.round(total / span)) : 1

    for (let k = 0; k < count; k++) {
      const keepStart = k * span
      const last = k === count - 1
      const keepEnd = last ? null : keepStart + span
      chunks.push({
        index: chunks.length,
        source,
        path: info.path,
        decodeStart: Math.max(0, keepStart - SEEK_PRE_ROLL),
        decodeEnd: keepEnd === null ? null : keepEnd + SEEK_POST_ROLL,
        keepStart,
        keepEnd,
        last,
      })
    }
  }
  return chunks
}
