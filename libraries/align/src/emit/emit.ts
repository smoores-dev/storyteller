import { mkdir, readFile, readdir } from "node:fs/promises"
import { basename, extname, join } from "node:path"

import { enumerate } from "itertools"
import { type Logger } from "pino"

import { isAudioFile } from "@storyteller-platform/audiobook"
import {
  type TimingAggregator,
  createAggregator,
  emit as emitFile,
  formatSingleReport,
} from "@storyteller-platform/ghost-story"
import {
  type Wav2Vec2DataType,
  type Wav2Vec2Device,
  type Wav2Vec2Model,
} from "@storyteller-platform/ghost-story/constants"

import { writeEmissionsFile } from "./fs.ts"

export interface EmitOptions {
  onProgress?: ((progress: number) => void) | null | undefined
  signal?: AbortSignal | null | undefined
  model?: Wav2Vec2Model | null | undefined
  device?: Wav2Vec2Device | null | undefined
  dtype?: Wav2Vec2DataType | null | undefined
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
  const filenames = allFiles.toSorted().filter((f) => isAudioFile(f))

  if (!filenames.length) {
    throw new Error(
      `Failed to transcribe audio: found no audio files in ${input}`,
    )
  }

  const engine = "wav2vec2"
  const model =
    options.model ?? "onnx-community/mms-300m-1130-forced-aligner-ONNX"

  const emissions: string[] = []

  // Prevent incorrect type narrowing
  function aborted() {
    return signal.aborted
  }

  const timing = createAggregator()
  timing.setMetadata("engine", engine)
  timing.setMetadata("model", model)

  for (const [i, filename] of enumerate(filenames)) {
    if (aborted()) throw new Error("Aborted")

    const filepath = join(input, filename)
    const emissionFilepath = join(
      output,
      `${basename(filename, extname(filename))}.json`,
    )

    try {
      await readFile(emissionFilepath, {
        encoding: "utf-8",
        signal,
      })

      options.logger?.info(`Found existing transcription for ${filepath}`)
      emissions.push(emissionFilepath)
      options.onProgress?.((emissions.length + 1) / filenames.length)
      continue
    } catch {
      //
    }

    if (aborted()) throw new Error("Aborted")

    // eslint-disable-next-line no-inner-declarations
    function onFileProgress(progress: number) {
      const updatedProgress = (i + progress) / filenames.length
      options.logger?.info(`Progress: ${Math.floor(updatedProgress * 100)}%`)
      options.onProgress?.(updatedProgress)
    }

    const result = await emitFile(filepath, {
      ...options,
      signal,
      engine,
      options: {
        model,
        ...(options.device && { device: options.device }),
        ...(options.dtype && { dtype: options.dtype }),
        onProgress: onFileProgress,
      },
    })

    options.logger?.info(
      formatSingleReport(
        result.timing,
        `Transcription Timing Report for ${filepath}`,
      ),
    )
    timing.add(result.timing)

    await writeEmissionsFile(emissionFilepath, result, { signal })

    emissions.push(emissionFilepath)
    options.onProgress?.((i + 1) / filenames.length)
  }

  return timing
}
