import { type AudioFormat } from "../audio/AudioFormat.ts"
import { WAV2VEC2_MODEL } from "../constants.ts"
import { type Wav2Vec2Options } from "../emission/Wav2Vec2Emission.ts"
// import { type Wav2Vec2ServerOptions } from "../emission/Wav2Vec2ServerEmission.ts"
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
    case "wav2vec-local": {
      const Wav2Vec2Emission = await import("../emission/Wav2Vec2Emission.ts")

      timing.setMetadata("model", opts.options.model)

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
    // case "wav2vec-server": {
    //   const Wav2Vec2ServerEmission = await import(
    //     "../emission/Wav2Vec2ServerEmission.ts"
    //   )
    //
    //   timing.setMetadata("baseURL", opts.options.baseURL)
    //
    //   const result = await Wav2Vec2ServerEmission.emit(
    //     source,
    //     timing,
    //     opts.options,
    //     opts.signal,
    //   )
    //
    //   return {
    //     ...result,
    //     timing: timing.summary(),
    //   }
    // }
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
  engine: "wav2vec-local"
  options: Wav2Vec2Options
}
// | (BaseEmissionOptions & {
//     engine: "wav2vec-server"
//     options: Wav2Vec2ServerOptions
//   })

const defaultEmissionOptions: Partial<EmissionOptions> = {
  engine: "wav2vec-local",
  options: {
    model: WAV2VEC2_MODEL,
  },
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
