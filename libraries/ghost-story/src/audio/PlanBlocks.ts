export const PCM_SAMPLE_RATE = 16000

const SEEK_PRE_ROLL = 3200

const SEEK_POST_ROLL = 640

export interface Grid {
  chunkSamples: number
  chunksPerBlock: number
}

export interface SourceInfo {
  path: string
  durationSeconds: number
  seekable: boolean
  range?: SampleRange | undefined
}

export interface SampleRange {
  start: number
  end: number | null
}

export interface BlockRequest {
  index: number
  source: number
  path: string
  decodeStart: number
  decodeEnd: number | null
  keepStart: number
  keepEnd: number | null
  last: boolean
}

export function planBlocks(sources: SourceInfo[], grid: Grid): BlockRequest[] {
  const size = grid.chunkSamples * grid.chunksPerBlock
  if (size <= 0) {
    throw new Error("A block must hold at least one sample")
  }

  const blocks: BlockRequest[] = []
  for (const [source, info] of sources.entries()) {
    const first = info.range?.start ?? 0
    const end = info.range?.end ?? null
    const total = end ?? Math.round(info.durationSeconds * PCM_SAMPLE_RATE)
    const count = info.seekable
      ? Math.max(1, Math.round((total - first) / size))
      : 1

    for (let k = 0; k < count; k++) {
      const keepStart = first + k * size
      const last = k === count - 1
      const keepEnd = last ? end : keepStart + size
      blocks.push({
        index: blocks.length,
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
  return blocks
}
