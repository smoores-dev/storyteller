import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { basename, extname, join } from "node:path"

import { enumerate } from "itertools"
import { type Logger } from "pino"

import {
  type EmissionOptions,
  type TimingAggregator,
  audioSourceFromFile,
  createAggregator,
  emit as emitFile,
  formatSingleReport,
  readAudioAsFloat32,
  resolveWav2Vec2Device,
} from "@storyteller-platform/ghost-story"
import {
  type CtcModel,
  type CtcModelFamily,
  type Wav2Vec2DataType,
  type Wav2Vec2Device,
  type Wav2VecEngine,
  ctcChunkSeconds,
  resolveCtcDtype,
  resolveCtcModel,
} from "@storyteller-platform/ghost-story/constants"
import { MediaType } from "@storyteller-platform/media-types"

import {
  type TrackSource,
  pruneStaleOutputs,
  readTrackSource,
} from "../process/trackSource.ts"

import { writeEmissionsFile } from "./fs.ts"

const DECODE_LOOKAHEAD = 3

export interface EmitOptions {
  onProgress?: ((progress: number) => void) | null | undefined
  signal?: AbortSignal | null | undefined
  engine?: Wav2VecEngine | null | undefined
  device?: Wav2Vec2Device | null | undefined
  model?: CtcModelFamily | null | undefined
  dtype?: Wav2Vec2DataType | null | undefined
  batchSize?: number | null | undefined
  language?: Intl.Locale | null | undefined
  // serverUrl?: string | null | undefined
  // serverApiKey?: string | null | undefined
  logger?: Logger | null | undefined
}

type Identity = {
  engine: Wav2VecEngine
  model: CtcModel
  dtype: Wav2Vec2DataType
  chunkSeconds: number
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
  const controller = new AbortController()
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    controller.signal,
  ])

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

  const engine = options.engine ?? "wav2vec-local"
  const device = resolveWav2Vec2Device(
    options.device,
    process.env["STORYTELLER_WHISPER_VARIANT"],
  )
  const family = options.model ?? "mms"
  const language = options.language?.language ?? null
  const dtype = resolveCtcDtype(family, device, options.dtype)
  const model = resolveCtcModel(family, language, device, dtype)
  const chunkSeconds = ctcChunkSeconds(family)
  // const serverUrl = options.serverUrl ?? ""
  //
  // if (engine === "wav2vec-server" && !serverUrl) {
  //   throw new Error("Missing wav2vec server URL")
  // }

  // Prevent incorrect type narrowing
  function aborted() {
    return signal.aborted
  }

  const timing = createAggregator()
  timing.setMetadata("engine", engine)

  const planned: PlannedTrack[] = []
  for (const filename of filenames) {
    if (aborted()) throw new Error("Aborted")

    const filepath = join(input, filename)
    const emissionName = basename(filename, extname(filename))
    const emissionFilepath = join(output, `${emissionName}.emissions`)
    const identityFilepath = join(output, `${emissionName}.identity`)
    const identity = {
      engine,
      model,
      dtype,
      chunkSeconds,
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
        signal,
      })
        .then((file) => JSON.parse(file) as Record<string, unknown>)
        .catch(() => ({}))) as Partial<Identity>

      status =
        cachedIdentity.engine === identity.engine &&
        cachedIdentity.model === identity.model &&
        cachedIdentity.dtype === identity.dtype &&
        cachedIdentity.chunkSeconds === identity.chunkSeconds &&
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

  const decodes = new Map<number, Promise<Float32Array>>()

  function decode(index: number) {
    const track = planned[index]
    if (!track || track.status === "cached") {
      return
    }
    const existing = decodes.get(index)
    if (existing) {
      return existing
    }
    const samples = readAudioAsFloat32(audioSourceFromFile(track.filepath))
    samples.catch(() => {})

    decodes.set(index, samples)
    return samples
  }

  for (const [i, track] of enumerate(planned)) {
    if (aborted()) throw new Error("Aborted")

    options.onProgress?.(i / planned.length)

    if (track.status === "cached") {
      options.logger?.info(`Found existing emissions for ${track.filepath}`)
      options.onProgress?.((i + 1) / planned.length)
      continue
    }

    if (track.status === "stale") {
      options.logger?.warn(
        `Existing emissions for ${track.filepath} came from a different engine, model, precision, chunk length or audio track, regenerating`,
      )
    }

    if (aborted()) throw new Error("Aborted")

    const samples = decode(i)
    let ahead = 0

    // try and look ahead a bit
    // gives cpu something to do while gpu is busy
    for (
      let j = i + 1;
      j < planned.length && ahead < DECODE_LOOKAHEAD && !aborted();
      j++
    ) {
      if (decode(j)) {
        ahead++
      }
    }

    decodes.delete(i)

    // eslint-disable-next-line no-inner-declarations
    function onFileProgress(progress: number) {
      const updatedProgress = (i + progress) / planned.length
      options.logger?.info(`Progress: ${Math.floor(updatedProgress * 100)}%`)
      options.onProgress?.(updatedProgress)
    }

    const emissionOptions: EmissionOptions = {
      signal,
      engine,
      options: {
        device,
        model: family,
        dtype,
        batchSize: options.batchSize ?? null,
        language,
        ...(samples && { samples: () => samples }),
        onProgress: onFileProgress,
      },
    }
    // const emissionOptions: EmissionOptions =
    //   engine === "wav2vec-server"
    //     ? {
    //         signal,
    //         engine,
    //         options: {
    //           baseURL: serverUrl,
    //           ...(options.serverApiKey && { apiKey: options.serverApiKey }),
    //           onProgress: onFileProgress,
    //         },
    //       }
    //     : {
    //         signal,
    //         engine,
    //         options: {
    //           model: WAV2VEC2_MODEL,
    //           ...(options.device && { device: options.device }),
    //           ...(options.dtype && { dtype: options.dtype }),
    //           onProgress: onFileProgress,
    //         },
    //       }

    const result = await emitFile(track.filepath, emissionOptions)

    options.logger?.info(
      formatSingleReport(
        result.timing,
        `Transcription Timing Report for ${track.filepath}`,
      ),
    )
    timing.add(result.timing)

    const tmpFilepath = `${track.emissionFilepath}.tmp`
    try {
      await writeEmissionsFile(tmpFilepath, result, { signal })
      await rm(track.identityFilepath, { force: true })
      await rename(tmpFilepath, track.emissionFilepath)
      await writeFile(track.identityFilepath, JSON.stringify(track.identity), {
        encoding: "utf-8",
      })
    } catch (err) {
      await rm(tmpFilepath, { force: true })
      throw err
    }

    options.onProgress?.((i + 1) / planned.length)
  }

  return timing
}
