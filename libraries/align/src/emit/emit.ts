import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"

import { type Logger } from "pino"

import { isHiddenFile } from "@storyteller-platform/fs"
import {
  type CtcServer,
  type LoadedCtcModel,
  type RemoteRunOptions,
  type TimingAggregator,
  createAggregator,
  createTiming,
  emitRemote,
  emitTracks,
  formatSingleReport,
  loadCtcModel,
  mapOrdered,
  probeSource,
  resolveCtcRun,
  resolveRemoteCtcRun,
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

import { replaceFile, writeEmissionsStream } from "./fs.ts"

const REMOTE_TRACKS_IN_FLIGHT = 3

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
  serverUrl?: string | null | undefined
  serverApiKey?: string | null | undefined
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
    .filter((f) => !isHiddenFile(f) && MediaType.fromPath(f)?.kind === "audio")

  if (!filenames.length) {
    throw new Error(
      `Failed to transcribe audio: found no audio files in ${input}`,
    )
  }

  await pruneStaleOutputs(output, filenames)

  const engine =
    options.engine ?? (options.serverUrl ? "ctc-server" : "ctc-local")
  const runOptions: RemoteRunOptions = {
    model: options.model,
    language: options.language?.language ?? null,
    dtype: options.dtype,
  }

  if (engine === "ctc-server" && !options.serverUrl) {
    throw new Error(
      "The ctc-server engine needs the URL of a ghost-story server",
    )
  }
  const server: CtcServer = {
    url: options.serverUrl ?? "",
    apiKey: options.serverApiKey,
  }
  const backend =
    engine === "ctc-server"
      ? {
          kind: "server" as const,
          run: await resolveRemoteCtcRun(server, runOptions, signal),
        }
      : {
          kind: "local" as const,
          run: resolveCtcRun({
            ...runOptions,
            device: options.device,
            batchSize: options.batchSize,
            buildVariant: process.env["STORYTELLER_WHISPER_VARIANT"],
          }),
        }
  const run = backend.run

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

  if (backend.kind === "server") {
    const fractions = new Map<PlannedTrack, number>()
    const report = () => {
      let done = cached
      for (const fraction of fractions.values()) {
        done += fraction
      }
      options.onProgress?.(done / planned.length)
    }
    const results = mapOrdered(
      pending,
      REMOTE_TRACKS_IN_FLIGHT,
      async (target, scope) => {
        const emitted = await emitRemote(target.filepath, server, runOptions, {
          signal: scope,
          onProgress: (done, total) => {
            fractions.set(target, done / total)
            report()
          },
        })
        await rm(target.identityFilepath, { force: true })
        await writeEmissionsStream(target.emissionFilepath, emitted.body, {
          signal: scope,
        })
        return { target, timing: emitted.timing }
      },
      signal,
    )
    for await (const result of results) {
      const summary = { ...result.timing, spans: [] }
      options.logger?.info(
        formatSingleReport(
          summary,
          `Transcription Timing Report for ${result.target.filepath} on ${server.url}`,
        ),
      )
      timing.add(summary)
      await writeFile(
        result.target.identityFilepath,
        JSON.stringify(result.target.identity),
        { encoding: "utf-8" },
      )
      fractions.set(result.target, 1)
      report()
    }
    return timing
  }

  const sources = await Promise.all(
    pending.map((track) => probeSource(track.filepath)),
  )

  const loadTiming = createTiming()
  await using loaded: LoadedCtcModel = await loadCtcModel(backend.run, {
    timing: loadTiming,
    signal,
  })
  options.logger?.info(
    formatSingleReport(
      loadTiming.summary(),
      `Model load for ${loaded.run.variant} on ${loaded.run.device}`,
    ),
  )

  const tracks = emitTracks(
    sources,
    pending.map((track) => `${track.emissionFilepath}.partial`),
    loaded,
    {
      concurrency: options.concurrency,
      signal,
      onBlock: (done, total) => {
        options.onProgress?.(
          (cached + (done / total) * pending.length) / planned.length,
        )
      },
    },
  )
  for await (const track of tracks) {
    const target = pending[track.source] as PlannedTrack
    options.logger?.info(
      formatSingleReport(
        track.timing,
        `Transcription Timing Report for ${target.filepath}`,
      ),
    )
    timing.add(track.timing)

    await rm(target.identityFilepath, { force: true })
    await replaceFile(
      `${target.emissionFilepath}.partial`,
      target.emissionFilepath,
    )
    await writeFile(target.identityFilepath, JSON.stringify(target.identity), {
      encoding: "utf-8",
    })
  }

  return timing
}
