import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import { basename, extname, join } from "node:path"

import { type Logger } from "pino"

import {
  type Emissions,
  type LoadedCtcModel,
  PCM_SAMPLE_RATE,
  Scratch,
  type Timing,
  type TimingAggregator,
  createAggregator,
  createTiming,
  decodePcm,
  emitWindows,
  formatSingleReport,
  loadCtcModel,
  mapOrdered,
  planChunks,
  probeSource,
  resolveCtcRun,
} from "@storyteller-platform/ghost-story"
import {
  type CtcDataType,
  type CtcDevice,
  type CtcEngine,
  type CtcModelFamily,
  type CtcModelVariant,
} from "@storyteller-platform/ghost-story/constants"
import { MediaType } from "@storyteller-platform/media-types"

import {
  type TrackSource,
  pruneStaleOutputs,
  readTrackSource,
} from "../process/trackSource.ts"

import { writeEmissionsFile } from "./fs.ts"

const CHUNK_SECONDS = 300

export interface EmitOptions {
  onProgress?: ((progress: number) => void) | null | undefined
  signal?: AbortSignal | null | undefined
  engine?: CtcEngine | null | undefined
  device?: CtcDevice | null | undefined
  model?: CtcModelFamily | null | undefined
  dtype?: CtcDataType | null | undefined
  batchSize?: number | null | undefined
  language?: Intl.Locale | null | undefined
  concurrency?: number | null | undefined
  logger?: Logger | null | undefined
}

type Identity = {
  engine: CtcEngine
  model: CtcModelVariant
  dtype: CtcDataType
  chunkSeconds: number
  startOffsetSeconds: number
  endOffsetSeconds: number
  track: TrackSource | null
}

type PlannedTrack = {
  filepath: string
  emissionFilepath: string
  identityFilepath: string
  identity: Identity
  status: "cached" | "stale" | "missing"
}

type TrackProgress = {
  timing: Timing
  parts: Emissions[]
  secondsPerChunk: number
  framesPerChunk: number
}

export async function emit(
  input: string,
  output: string,
  options: EmitOptions,
): Promise<TimingAggregator> {
  const signal = options.signal ?? null

  await mkdir(output, { recursive: true })

  const allFiles = await readdir(input, { recursive: true })
  const filenames = allFiles
    .toSorted()
    .filter((f) => MediaType.fromPath(f)?.kind === "audio")

  if (!filenames.length) {
    throw new Error(
      `Failed to transcribe audio: found no audio files in ${input}`,
    )
  }

  await pruneStaleOutputs(output, filenames)

  const engine = options.engine ?? "ctc-local"
  const run = resolveCtcRun({
    device: options.device,
    model: options.model,
    language: options.language?.language ?? null,
    dtype: options.dtype,
    batchSize: options.batchSize,
    buildVariant: process.env["STORYTELLER_WHISPER_VARIANT"],
  })

  const timing = createAggregator()
  timing.setMetadata("engine", engine)

  const planned: PlannedTrack[] = []
  for (const filename of filenames) {
    signal?.throwIfAborted()

    const filepath = join(input, filename)
    const emissionName = basename(filename, extname(filename))
    const emissionFilepath = join(output, `${emissionName}.emissions`)
    const identityFilepath = join(output, `${emissionName}.identity`)
    const identity = {
      engine,
      model: run.variant,
      dtype: run.dtype,
      chunkSeconds: run.chunkSeconds,
      startOffsetSeconds: run.startOffsetSeconds,
      endOffsetSeconds: run.endOffsetSeconds,
      track: await readTrackSource(filepath),
    }

    const emissionSize = await stat(emissionFilepath).then(
      (stats) => stats.size,
      () => 0,
    )

    let status: PlannedTrack["status"] = "missing"
    if (emissionSize > 0) {
      const cachedIdentity = (await readFile(identityFilepath, {
        encoding: "utf-8",
        ...(signal ? { signal } : {}),
      })
        .then((file) => JSON.parse(file) as Record<string, unknown>)
        .catch(() => ({}))) as Partial<Identity>

      const cachedEngine =
        cachedIdentity.engine === ("wav2vec-local" as string)
          ? "ctc-local"
          : cachedIdentity.engine
      status =
        cachedEngine === identity.engine &&
        cachedIdentity.model === identity.model &&
        cachedIdentity.dtype === identity.dtype &&
        cachedIdentity.chunkSeconds === identity.chunkSeconds &&
        cachedIdentity.startOffsetSeconds === identity.startOffsetSeconds &&
        cachedIdentity.endOffsetSeconds === identity.endOffsetSeconds &&
        JSON.stringify(cachedIdentity.track ?? "") ===
          JSON.stringify(identity.track ?? "")
          ? "cached"
          : "stale"
    }

    planned.push({
      filepath,
      emissionFilepath,
      identityFilepath,
      identity,
      status,
    })
  }

  const pending: PlannedTrack[] = []
  for (const track of planned) {
    if (track.status === "cached") {
      options.logger?.info(`Found existing emissions for ${track.filepath}`)
      continue
    }
    if (track.status === "stale") {
      options.logger?.warn(
        `Existing emissions for ${track.filepath} came from a different engine, model, precision, chunk length or audio track, regenerating`,
      )
    }
    pending.push(track)
  }

  const cached = planned.length - pending.length
  options.onProgress?.(cached / planned.length)

  if (pending.length === 0) {
    return timing
  }

  const sources = await Promise.all(
    pending.map((track) => probeSource(track.filepath)),
  )

  const loadTiming = createTiming()
  await using loaded: LoadedCtcModel = await loadCtcModel(run, {
    timing: loadTiming,
    signal,
  })
  options.logger?.info(
    formatSingleReport(
      loadTiming.summary(),
      `Model load for ${run.variant} on ${run.device}`,
    ),
  )

  const windowSamples = Math.round(run.chunkSeconds * PCM_SAMPLE_RATE)
  const chunks = planChunks(sources, {
    windowSamples,
    windowsPerChunk: Math.max(
      run.batchSize,
      Math.ceil(CHUNK_SECONDS / run.chunkSeconds),
    ),
  })

  const progress = new Map<number, TrackProgress>()

  await using scratch = await Scratch.create()

  const decoded = mapOrdered(
    chunks,
    options.concurrency ?? Math.min(4, os.availableParallelism() - 2),
    async (chunk, scope) => {
      const track = progressFor(progress, chunk.source)
      const samples = await track.timing.timeAsync("conversion", () =>
        decodePcm(chunk, { scratch, signal: scope }),
      )
      return { chunk, samples }
    },
    signal,
  )

  for await (const { chunk, samples } of decoded) {
    const track = progressFor(progress, chunk.source)
    const source = sources[chunk.source] as (typeof sources)[number]
    const target = pending[chunk.source] as PlannedTrack

    const windows: Float32Array[] = []
    for (let i = 0; i < samples.length; i += windowSamples) {
      const window = samples.subarray(i, i + windowSamples)
      if (window.length >= loaded.minSamples) {
        windows.push(window)
      }
    }

    const emissions = await track.timing.timeAsync("transcription", () =>
      emitWindows(loaded, windows, signal),
    )
    for (const [i, part] of emissions.entries()) {
      track.parts.push({
        values: part.values.slice(0, part.frames * part.classes),
        frames: part.frames,
        classes: part.classes,
      })
      if (track.framesPerChunk === 0) {
        track.framesPerChunk = part.frames
        track.secondsPerChunk =
          (windows[i] as Float32Array).length / PCM_SAMPLE_RATE
      }
    }

    options.onProgress?.(
      (cached + ((chunk.index + 1) / chunks.length) * pending.length) /
        planned.length,
    )

    if (!chunk.last) {
      continue
    }

    if (track.framesPerChunk === 0) {
      throw new Error(`Failed to process empty audio source ${source.path}`)
    }

    const merged = mergeEmissions(track.parts)
    track.timing.setMetadata("audioLength", source.durationSeconds)
    track.timing.setMetadata("device", loaded.run.device)
    track.timing.setMetadata("model", loaded.run.variant)
    track.timing.setMetadata("dtype", loaded.dtype)
    track.timing.setMetadata("batchSize", loaded.run.batchSize)
    const summary = track.timing.summary()
    options.logger?.info(
      formatSingleReport(
        summary,
        `Transcription Timing Report for ${target.filepath}`,
      ),
    )
    timing.add(summary)
    progress.delete(chunk.source)

    await rm(target.identityFilepath, { force: true })
    await writeEmissionsFile(
      target.emissionFilepath,
      {
        emissions: merged,
        numFrames: merged.frames,
        vocab: loaded.vocab,
        blankIndex: loaded.blankIndex,
        secondsPerChunk: track.secondsPerChunk,
        framesPerChunk: track.framesPerChunk,
        secondsPerFrame: loaded.samplesPerFrame / PCM_SAMPLE_RATE,
        startOffsetSeconds: loaded.startOffsetSeconds,
        endOffsetSeconds: loaded.endOffsetSeconds,
        tokenizer: loaded.tokenizer,
      },
      { signal: signal ?? undefined },
    )
    await writeFile(target.identityFilepath, JSON.stringify(target.identity), {
      encoding: "utf-8",
    })
  }

  return timing
}

function progressFor(progress: Map<number, TrackProgress>, source: number) {
  let track = progress.get(source)
  if (!track) {
    track = {
      timing: createTiming(),
      parts: [],
      secondsPerChunk: 0,
      framesPerChunk: 0,
    }
    progress.set(source, track)
  }
  return track
}

function mergeEmissions(parts: Emissions[]): Emissions {
  const classes = parts[0]?.classes ?? 0
  const frames = parts.reduce((total, part) => total + part.frames, 0)
  const values = new Float32Array(frames * classes)
  let offset = 0
  for (const part of parts) {
    values.set(part.values, offset)
    offset += part.values.length
  }
  return { values, frames, classes }
}
