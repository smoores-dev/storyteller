import os from "node:os"

import { decodePcm } from "../audio/DecodePcm.ts"
import {
  type Grid,
  PCM_SAMPLE_RATE,
  type SourceInfo,
  planBlocks,
} from "../audio/PlanBlocks.ts"
import { mapOrdered } from "../utilities/MapOrdered.ts"
import { Scratch } from "../utilities/Scratch.ts"
import {
  type Timing,
  type TimingSummary,
  createTiming,
} from "../utilities/Timing.ts"

import { emitChunks } from "./CtcEmission.ts"
import { type CtcRun, type LoadedCtcModel } from "./CtcModel.ts"
import { EmissionsWriter } from "./EmissionsWriter.ts"
import { type EmissionsMeta } from "./encoding.ts"

const BLOCK_SECONDS = 300

export interface EmitTracksOptions {
  concurrency?: number | null | undefined
  signal?: AbortSignal | null | undefined
  ffmpegPath?: string | undefined
  scratch?: Scratch | undefined
  onBlock?: ((done: number, total: number) => void) | undefined
  compute?: (<T>(task: () => Promise<T>) => Promise<T>) | undefined
}

export interface EmittedTrack {
  source: number
  numFrames: number
  timing: TimingSummary
}

type TrackProgress = {
  timing: Timing
  writer: EmissionsWriter | null
  secondsPerChunk: number
  framesPerChunk: number
}

export function blockGrid(
  run: Pick<CtcRun, "chunkSeconds" | "batchSize">,
): Grid {
  return {
    chunkSamples: Math.round(run.chunkSeconds * PCM_SAMPLE_RATE),
    chunksPerBlock: Math.max(
      run.batchSize,
      Math.ceil(BLOCK_SECONDS / run.chunkSeconds),
    ),
  }
}

export async function* emitTracks(
  sources: SourceInfo[],
  outputs: string[],
  loaded: LoadedCtcModel,
  options: EmitTracksOptions = {},
): AsyncGenerator<EmittedTrack, void, void> {
  const signal = options.signal ?? null
  const compute = options.compute ?? ((task) => task())

  const grid = blockGrid(loaded.run)
  const blocks = planBlocks(sources, grid)

  const meta: EmissionsMeta = {
    vocab: loaded.vocab,
    blankIndex: loaded.blankIndex,
    classes: loaded.vocab.size,
    secondsPerChunk: 0,
    framesPerChunk: 0,
    secondsPerFrame: loaded.samplesPerFrame / PCM_SAMPLE_RATE,
    startOffsetSeconds: loaded.startOffsetSeconds,
    endOffsetSeconds: loaded.endOffsetSeconds,
    tokenizer: loaded.tokenizer,
  }

  const progress = new Map<number, TrackProgress>()
  await using writers = new AsyncDisposableStack()

  await using owned = options.scratch ? null : await Scratch.create()
  const scratch = (options.scratch ?? owned) as Scratch

  const decoded = mapOrdered(
    blocks,
    options.concurrency ??
      Math.max(1, Math.min(4, os.availableParallelism() - 2)),
    async (block, scope) => {
      const track = progressFor(progress, block.source)
      const samples = await track.timing.timeAsync("conversion", () =>
        decodePcm(block, {
          scratch,
          signal: scope,
          ffmpegPath: options.ffmpegPath,
        }),
      )
      return { block, samples }
    },
    signal,
  )

  for await (const { block, samples } of decoded) {
    const track = progressFor(progress, block.source)
    const source = sources[block.source] as SourceInfo

    const chunks: Float32Array[] = []
    for (let i = 0; i < samples.length; i += grid.chunkSamples) {
      const chunk = samples.subarray(i, i + grid.chunkSamples)
      if (chunk.length >= loaded.minSamples) {
        chunks.push(chunk)
      }
    }

    const emissions = await track.timing.timeAsync("transcription", () =>
      compute(() => emitChunks(loaded, chunks, signal)),
    )
    track.writer ??= writers.use(
      await EmissionsWriter.create(outputs[block.source] as string, meta),
    )
    for (const [i, part] of emissions.entries()) {
      await track.writer.append(part)
      if (track.framesPerChunk === 0) {
        track.framesPerChunk = part.frames
        track.secondsPerChunk =
          (chunks[i] as Float32Array).length / PCM_SAMPLE_RATE
      }
    }

    options.onBlock?.(block.index + 1, blocks.length)

    if (!block.last) {
      continue
    }

    if (track.framesPerChunk === 0) {
      throw new Error(`Failed to process empty audio source ${source.path}`)
    }

    const numFrames = await track.writer.finish({
      ...meta,
      secondsPerChunk: track.secondsPerChunk,
      framesPerChunk: track.framesPerChunk,
    })
    track.timing.setMetadata("audioLength", source.durationSeconds)
    track.timing.setMetadata("device", loaded.run.device)
    track.timing.setMetadata("model", loaded.run.variant)
    track.timing.setMetadata("dtype", loaded.dtype)
    track.timing.setMetadata("batchSize", loaded.run.batchSize)
    progress.delete(block.source)

    yield {
      source: block.source,
      numFrames,
      timing: track.timing.summary(),
    }
  }
}

function progressFor(progress: Map<number, TrackProgress>, source: number) {
  let track = progress.get(source)
  if (!track) {
    track = {
      timing: createTiming(),
      writer: null,
      secondsPerChunk: 0,
      framesPerChunk: 0,
    }
    progress.set(source, track)
  }
  return track
}
