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

import { isAudioFile } from "@storyteller-platform/audiobook"
import {
  type EmissionOptions,
  type TimingAggregator,
  createAggregator,
  emit as emitFile,
  formatSingleReport,
} from "@storyteller-platform/ghost-story"
import {
  type CtcEngine,
  DEFAULT_WAV2VEC2_MODEL,
  type Wav2Vec2DataType,
  type Wav2Vec2Device,
  type Wav2Vec2Model,
} from "@storyteller-platform/ghost-story/constants"

export interface EmitOptions {
  onProgress?: ((progress: number) => void) | null | undefined
  signal?: AbortSignal | null | undefined
  engine?: CtcEngine | null | undefined
  model?: Wav2Vec2Model | null | undefined
  device?: Wav2Vec2Device | null | undefined
  dtype?: Wav2Vec2DataType | null | undefined
  serverUrl?: string | null | undefined
  serverApiKey?: string | null | undefined
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

  const existingFiles = await readdir(output)
  for (const existing of existingFiles) {
    if (!existing.endsWith(".tmp")) continue
    await rm(join(output, existing), { force: true })
  }

  const allFiles = await readdir(input, { recursive: true })
  const filenames = allFiles.toSorted().filter((f) => isAudioFile(f))

  if (!filenames.length) {
    throw new Error(
      `Failed to transcribe audio: found no audio files in ${input}`,
    )
  }

  const engine = options.engine ?? "ctc-local"
  const serverUrl = options.serverUrl ?? ""

  if (engine === "ctc-server" && !serverUrl) {
    throw new Error("Missing CTC server URL")
  }

  const model = options.model ?? DEFAULT_WAV2VEC2_MODEL

  // Prevent incorrect type narrowing
  function aborted() {
    return signal.aborted
  }

  const identity = JSON.stringify(
    engine === "ctc-server" ? { engine, serverUrl } : { engine, model },
  )

  const timing = createAggregator()
  timing.setMetadata(
    "engine",
    engine === "ctc-server" ? "wav2vec2-server" : "wav2vec2",
  )
  if (engine === "ctc-local") {
    timing.setMetadata("model", model)
  }

  for (const [i, filename] of enumerate(filenames)) {
    if (aborted()) throw new Error("Aborted")

    options.onProgress?.(i / filenames.length)

    const filepath = join(input, filename)
    const emissionName = basename(filename, extname(filename))
    const emissionFilepath = join(output, `${emissionName}.json`)
    const identityFilepath = join(output, `${emissionName}.identity`)

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
        `Existing emissions for ${filepath} came from a different engine or model, regenerating`,
      )
    }

    if (aborted()) throw new Error("Aborted")

    // eslint-disable-next-line no-inner-declarations
    function onFileProgress(progress: number) {
      const updatedProgress = (i + progress) / filenames.length
      options.logger?.info(`Progress: ${Math.floor(updatedProgress * 100)}%`)
      options.onProgress?.(updatedProgress)
    }

    const emissionOptions: EmissionOptions =
      engine === "ctc-server"
        ? {
            signal,
            engine: "wav2vec2-server",
            options: {
              baseURL: serverUrl,
              ...(options.serverApiKey && { apiKey: options.serverApiKey }),
              onProgress: onFileProgress,
            },
          }
        : {
            signal,
            engine: "wav2vec2",
            options: {
              model,
              ...(options.device && { device: options.device }),
              ...(options.dtype && { dtype: options.dtype }),
              onProgress: onFileProgress,
            },
          }

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
      await writeFile(
        tmpFilepath,
        JSON.stringify({
          ...result,
          vocab: Object.fromEntries(result.vocab),
        }),
        { signal },
      )
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
