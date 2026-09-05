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
  createAggregator,
  emit as emitFile,
  formatSingleReport,
} from "@storyteller-platform/ghost-story"
import {
  WAV2VEC2_MODEL,
  type Wav2Vec2DataType,
  type Wav2Vec2Device,
  type Wav2VecEngine,
} from "@storyteller-platform/ghost-story/constants"
import { MediaType } from "@storyteller-platform/media-types"

import { pruneStaleOutputs, readTrackSource } from "../process/trackSource.ts"

import { writeEmissionsFile } from "./fs.ts"

export interface EmitOptions {
  onProgress?: ((progress: number) => void) | null | undefined
  signal?: AbortSignal | null | undefined
  engine?: Wav2VecEngine | null | undefined
  device?: Wav2Vec2Device | null | undefined
  dtype?: Wav2Vec2DataType | null | undefined
  // serverUrl?: string | null | undefined
  // serverApiKey?: string | null | undefined
  logger?: Logger | null | undefined
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
  timing.setMetadata("model", WAV2VEC2_MODEL)

  for (const [i, filename] of enumerate(filenames)) {
    if (aborted()) throw new Error("Aborted")

    options.onProgress?.(i / filenames.length)

    const filepath = join(input, filename)
    const emissionName = basename(filename, extname(filename))
    const emissionFilepath = join(output, `${emissionName}.emissions`)
    const identityFilepath = join(output, `${emissionName}.identity`)
    const identity = JSON.stringify({
      engine,
      model: WAV2VEC2_MODEL,
      track: await readTrackSource(filepath),
    })

    const emissionSize = await stat(emissionFilepath).then(
      (stats) => stats.size,
      () => 0,
    )

    if (emissionSize > 0) {
      const cachedIdentity = await readFile(identityFilepath, {
        encoding: "utf-8",
        signal,
      }).catch(() => null)

      if (cachedIdentity === identity) {
        options.logger?.info(`Found existing emissions for ${filepath}`)
        options.onProgress?.((i + 1) / filenames.length)
        continue
      }

      options.logger?.warn(
        `Existing emissions for ${filepath} came from a different engine, model or audio track, regenerating`,
      )
    }

    if (aborted()) throw new Error("Aborted")

    // eslint-disable-next-line no-inner-declarations
    function onFileProgress(progress: number) {
      const updatedProgress = (i + progress) / filenames.length
      options.logger?.info(`Progress: ${Math.floor(updatedProgress * 100)}%`)
      options.onProgress?.(updatedProgress)
    }

    const emissionOptions: EmissionOptions = {
      signal,
      engine,
      options: {
        model: WAV2VEC2_MODEL,
        ...(options.device && { device: options.device }),
        ...(options.dtype && { dtype: options.dtype }),
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

    const result = await emitFile(filepath, emissionOptions)

    options.logger?.info(
      formatSingleReport(
        result.timing,
        `Transcription Timing Report for ${filepath}`,
      ),
    )
    timing.add(result.timing)

    const tmpFilepath = `${emissionFilepath}.tmp`
    try {
      await writeEmissionsFile(tmpFilepath, result, { signal })
      await rm(identityFilepath, { force: true })
      await rename(tmpFilepath, emissionFilepath)
      await writeFile(identityFilepath, identity, { encoding: "utf-8" })
    } catch (err) {
      await rm(tmpFilepath, { force: true })
      throw err
    }

    options.onProgress?.((i + 1) / filenames.length)
  }

  return timing
}
