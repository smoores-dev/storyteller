import { type AudioFormat } from "../audio/AudioFormat.ts"
import { type Wav2Vec2Options } from "../emission/Wav2Vec2Emission.ts"
import { extendDeep } from "../utilities/ObjectUtilities.ts"
import { type TimingSummary, createTiming } from "../utilities/Timing.ts"

import { type AudioInput, resolveAudioSource } from "./Recognition.ts"

export {
  type EmissionData,
  decodeEmissions,
  encodeEmissions,
} from "../emission/encoding.ts"

export async function emit(
  input: AudioInput,
  options: EmissionOptions,
): Promise<EmissionResult> {
  const opts = extendDeep(defaultEmissionOptions, options) as EmissionOptions

  const timing = createTiming()

  timing.setMetadata("engine", opts.engine)

  const source = resolveAudioSource(input, opts.inputFormat)
  timing.setMetadata("inputFormat", source.format)

  switch (opts.engine) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case "wav2vec2": {
      const Wav2Vec2Emission = await import("../emission/Wav2Vec2Emission.ts")

      const result = await Wav2Vec2Emission.emit(
        source,
        timing,
        opts.options,
        opts.signal,
      )

      return {
        ...result,
        timing: timing.summary(),
      }
    }
    default: {
      throw new Error(`Unknown engine: ${(opts as { engine: string }).engine}`)
    }
  }
}

interface BaseEmissionOptions {
  signal?: AbortSignal | null | undefined
  inputFormat?: AudioFormat
}

export type EmissionOptions = BaseEmissionOptions & {
  engine: "wav2vec2"
  options: Wav2Vec2Options
}
const defaultEmissionOptions: Partial<EmissionOptions> = {
  engine: "wav2vec2",
}

export interface EmissionResult {
  emissions: number[][]
  numFrames: number
  vocab: Map<string, number>
  blankIndex: number
  timing: TimingSummary
  secondsPerChunk: number
  framesPerChunk: number
  secondsPerFrame: number
}
