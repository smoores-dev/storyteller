/* eslint-disable no-constant-condition */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { type FileHandle, open, stat } from "fs/promises"

import { fileToWav } from "../convert.ts"
import { decodeAscii } from "../encodings/Ascii.ts"
import { extendDeep } from "../utilities/ObjectUtilities.ts"
import type { Timeline } from "../utilities/Timeline.ts"

export async function detectVoiceActivity(
  filepath: string,
  options: AdaptiveGateVADOptions | undefined,
) {
  const { rawAudio } = await ensureRawAudio(filepath)

  const channelCount = rawAudio.audioChannels.length
  const firstChannel = rawAudio.audioChannels[0]
  if (!firstChannel) {
    throw new Error("no audio channels found")
  }
  const sampleCount = firstChannel.length
  const sampleRate = rawAudio.sampleRate

  const audioDuration = getRawAudioDuration(rawAudio)

  options = extendDeep(defaultAdaptiveGateOptions, options)

  const gateVAD = new AdaptiveGateVAD(sampleRate, channelCount, options)

  type FrameRecord = {
    timePosition: number
    loudness: number
    minimumLoudness: number
    maximumLoudness: number
  }

  const frameDuration = 0.01

  const frameRecords: FrameRecord[] = []

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const timePosition = sampleIndex / sampleRate

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
      const channel = rawAudio.audioChannels[channelIndex]
      if (!channel) {
        throw new Error(`channel ${channelIndex} not found`)
      }
      const sample = channel[sampleIndex]
      if (sample === undefined) {
        throw new Error(`sample at index ${sampleIndex} not found`)
      }

      gateVAD.process(sample, channelIndex)
    }

    const lastRecord = frameRecords[frameRecords.length - 1]
    if (
      frameRecords.length == 0 ||
      (lastRecord && timePosition > lastRecord.timePosition + frameDuration)
    ) {
      const record: FrameRecord = {
        timePosition,
        loudness: gateVAD.loudnessEstimator.currentLoudness,
        minimumLoudness: gateVAD.minimumLoudnessEstimator.currentPeak,
        maximumLoudness: gateVAD.maximumLoudnessEstimator.currentPeak,
      }

      frameRecords.push(record)
    }
  }

  const frameActive: boolean[] = []

  for (let i = 0; i < frameRecords.length; i++) {
    frameActive[i] = false
  }

  {
    const backwardExtensionFrameCount = Math.floor(
      options.backwardExtensionDuration! / frameDuration,
    )
    const relativeThreshold = options.relativeThreshold!

    let extendedActivityStartIndex = frameRecords.length

    for (let i = frameRecords.length - 1; i >= 0; i--) {
      const record = frameRecords[i]
      if (!record) {
        continue
      }
      const referenceLoudness = Math.max(record.maximumLoudness, -30)

      let isActive = false

      if (i >= extendedActivityStartIndex) {
        isActive = true
      }

      if (record.loudness >= referenceLoudness + relativeThreshold) {
        isActive = true

        extendedActivityStartIndex = Math.max(
          i - backwardExtensionFrameCount,
          0,
        )
      }

      frameActive[i] = isActive
    }
  }

  const timeline: Timeline = []

  for (let i = 0; i < frameRecords.length; i++) {
    const record = frameRecords[i]

    if (!record) {
      console.warn("[ghost-story] No record found for frame", i)
      continue
    }

    const isActive = frameActive[i]
    const activityText = isActive ? "active" : "inactive"
    const startTime = record.timePosition
    const endTime = Math.min(startTime + frameDuration, audioDuration)

    if (timeline.length == 0 || timeline.at(-1)?.text != activityText) {
      timeline.push({
        type: "segment",
        text: activityText,
        startTime,
        endTime,
      })
    } else {
      timeline.at(-1)!.endTime = endTime
    }
  }

  return timeline
}

function getRawAudioDuration(rawAudio: RawAudio) {
  if (
    rawAudio.audioChannels.length == 0 ||
    rawAudio.sampleRate == 0 ||
    !rawAudio.audioChannels[0]
  ) {
    return 0
  }

  return rawAudio.audioChannels[0].length / rawAudio.sampleRate
}

type RawAudio = {
  audioChannels: Float32Array[]
  sampleRate: number
}

async function ensureRawAudio(input: string): Promise<{ rawAudio: RawAudio }> {
  const inputAsRawAudio = await decodeToChannels(input)

  return inputAsRawAudio
}

async function decodeToChannels(
  input: string,
): Promise<{ rawAudio: RawAudio }> {
  const outputPath = await fileToWav(input)
  const waveAudio = await readFileAsBinary(outputPath)

  return decodeWaveToRawAudio(waveAudio)
}

function decodeWaveToRawAudio(
  waveFileBuffer: Uint8Array,
  ignoreTruncatedChunks = true,
  ignoreOverflowingDataChunks = true,
) {
  const rawAudio = decodeWaveToFloat32Channels(
    waveFileBuffer,
    ignoreTruncatedChunks,
    ignoreOverflowingDataChunks,
  )

  return { rawAudio }
}

class AdaptiveGateVAD {
  channelHighpassFilters: BiquadFilter[]
  channelLowpassFilters: BiquadFilter[]

  loudnessEstimator: LoudnessEstimator

  minimumLoudnessEstimator: DecayingPeakEstimator
  maximumLoudnessEstimator: DecayingPeakEstimator

  constructor(
    public readonly sampleRate: number,
    public readonly channelCount: number,
    public readonly options: AdaptiveGateVADOptions,
  ) {
    this.channelHighpassFilters = []
    this.channelLowpassFilters = []

    for (let i = 0; i < this.channelCount; i++) {
      this.channelHighpassFilters.push(
        createHighpassFilter(this.sampleRate, options.lowCutoff!),
      )
      this.channelLowpassFilters.push(
        createLowpassFilter(this.sampleRate, options.highCutoff!),
      )
    }

    this.loudnessEstimator = new LoudnessEstimator({
      sampleRate: this.sampleRate,
      channelCount: this.channelCount,
      positiveAdaptationRate: options.positiveAdaptationRate!,
      negativeAdaptationRate: options.negativeAdaptationRate!,
      initialEstimate: -60,
      minimumLoudness: -60,
      applyKWeighting: false,
    })

    const ticksPerSecond = this.sampleRate * this.channelCount

    this.minimumLoudnessEstimator = new DecayingPeakEstimator(
      {
        kind: "minimum",
        decayPerSecond: options.peakLoudnessDecay!,
        initialPeak: -60,
      },
      ticksPerSecond,
    )

    this.maximumLoudnessEstimator = new DecayingPeakEstimator(
      {
        kind: "maximum",
        decayPerSecond: options.peakLoudnessDecay!,
        initialPeak: -60,
      },
      ticksPerSecond,
    )
  }

  process(sample: number, channelIndex: number) {
    const highpassFilter = this.channelHighpassFilters[channelIndex]
    const lowpassFilter = this.channelLowpassFilters[channelIndex]
    if (!highpassFilter || !lowpassFilter) {
      throw new Error(`filters for channel ${channelIndex} not found`)
    }
    sample = highpassFilter.filter(sample)
    sample = lowpassFilter.filter(sample)

    this.loudnessEstimator.process(sample, channelIndex)

    const currentLoudness = this.loudnessEstimator.currentLoudness

    this.minimumLoudnessEstimator.process(currentLoudness)

    if (currentLoudness >= -60) {
      this.maximumLoudnessEstimator.process(currentLoudness)
    }
  }
}

export interface AdaptiveGateVADOptions {
  lowCutoff?: number
  highCutoff?: number

  positiveAdaptationRate?: number
  negativeAdaptationRate?: number

  peakLoudnessDecay?: number

  backwardExtensionDuration?: number
  relativeThreshold?: number
}

const defaultAdaptiveGateOptions: AdaptiveGateVADOptions = {
  lowCutoff: 100,
  highCutoff: 1000,

  positiveAdaptationRate: 400.0,
  negativeAdaptationRate: 10.0,

  peakLoudnessDecay: 4.0,

  backwardExtensionDuration: 0.2,
  relativeThreshold: -15,
}

class LoudnessEstimator {
  readonly channelFilters: KWeightingFilter[] = []
  readonly channelMeanSquares: SmoothEstimator[] = []

  readonly minPower: number

  constructor(public readonly options: LoudnessEstimatorOptions) {
    const initialMeanSquares =
      decibelsToGainFactor(options.initialEstimate) ** 2

    const ticksPerSecond = this.options.sampleRate * this.options.channelCount

    for (let i = 0; i < options.channelCount; i++) {
      const weightingFilter = new KWeightingFilter(options.sampleRate)

      const channelMeanSquares = new SmoothEstimator(
        options.positiveAdaptationRate / ticksPerSecond,
        options.negativeAdaptationRate / ticksPerSecond,
        initialMeanSquares,
      )

      this.channelFilters.push(weightingFilter)
      this.channelMeanSquares.push(channelMeanSquares)
    }

    this.minPower = decibelsToGainFactor(options.minimumLoudness) ** 2
  }

  process(sample: number, channel: number) {
    let filteredSample: number

    if (this.options.applyKWeighting) {
      const filter = this.channelFilters[channel]
      if (!filter) {
        throw new Error(`channel filter ${channel} not found`)
      }
      filteredSample = filter.process(sample)
    } else {
      filteredSample = sample
    }

    const filteredSampleSquared = filteredSample ** 2

    const channelMeanSquares = this.channelMeanSquares[channel]
    if (!channelMeanSquares) {
      throw new Error(`channel mean squares ${channel} not found`)
    }

    channelMeanSquares.update(filteredSampleSquared)

    channelMeanSquares.estimate = Math.max(
      channelMeanSquares.estimate,
      this.minPower,
    )
  }

  get currentLoudness() {
    let totalMeanSquares = 0

    for (let i = 0; i < this.options.channelCount; i++) {
      const channelMeanSquare = this.channelMeanSquares[i]
      if (!channelMeanSquare) {
        throw new Error(`channel mean square ${i} not found`)
      }
      totalMeanSquares += channelMeanSquare.estimate
    }

    const rms = Math.sqrt(totalMeanSquares / this.options.channelCount)
    const rmsDecibels = gainFactorToDecibels(rms)

    return rmsDecibels
  }

  getCurrentRMSForChannel(channel: number) {
    const channelMeanSquare = this.channelMeanSquares[channel]
    if (!channelMeanSquare) {
      throw new Error(`channel mean square ${channel} not found`)
    }
    return Math.sqrt(channelMeanSquare.estimate)
  }
}

interface LoudnessEstimatorOptions {
  sampleRate: number
  channelCount: number
  positiveAdaptationRate: number
  negativeAdaptationRate: number
  initialEstimate: number
  minimumLoudness: number
  applyKWeighting: boolean
}

class DecayingPeakEstimator {
  public readonly decayPerTick: number

  currentPeak: number

  constructor(
    public readonly options: DecayingPeakEstimatorOptions,
    public readonly ticksPerSecond: number,
  ) {
    this.currentPeak = options.initialPeak
    this.decayPerTick = this.options.decayPerSecond / this.ticksPerSecond

    this.process =
      options.kind === "maximum"
        ? this.processMaximum.bind(this)
        : this.processMinimum.bind(this)
  }

  public readonly process: (value: number) => void

  private processMaximum(value: number) {
    this.currentPeak -= this.decayPerTick
    this.currentPeak = Math.max(value, this.currentPeak)
  }

  private processMinimum(value: number) {
    this.currentPeak += this.decayPerTick
    this.currentPeak = Math.min(value, this.currentPeak)
  }
}

interface DecayingPeakEstimatorOptions {
  kind: DecayingPeakEstimatorKind
  decayPerSecond: number
  initialPeak: number
}

type DecayingPeakEstimatorKind = "maximum" | "minimum"

function createLowpassFilter(
  sampleRate: number,
  cutoffFrequency: number,
  q = 0.7071,
) {
  return createFilter("lowpass", sampleRate, cutoffFrequency, q, 0)
}

function createHighpassFilter(
  sampleRate: number,
  cutoffFrequency: number,
  q = 0.7071,
) {
  return createFilter("highpass", sampleRate, cutoffFrequency, q, 0)
}

function createHighshelfFilter(
  sampleRate: number,
  midpointFrequency: number,
  gain: number,
) {
  return createFilter("highshelf", sampleRate, midpointFrequency, 0, gain)
}

function createFilter(
  filterType: FilterType,
  sampleRate: number,
  frequency: number,
  q: number,
  gain: number,
) {
  const coefficients = getFilterCoefficients(
    filterType,
    sampleRate,
    frequency,
    q,
    gain,
  )

  return new BiquadFilter(coefficients)
}

class BiquadFilter {
  private b0 = 0
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0

  private prevInput1 = 0
  private prevInput2 = 0

  private prevOutput1 = 0
  private prevOutput2 = 0

  constructor(coefficients: FilterCoefficients) {
    this.setCoefficients(coefficients)
  }

  filter(sample: number): number {
    const filteredSample =
      this.b0 * sample +
      this.b1 * this.prevInput1 +
      this.b2 * this.prevInput2 -
      this.a1 * this.prevOutput1 -
      this.a2 * this.prevOutput2

    this.prevInput2 = this.prevInput1
    this.prevInput1 = sample

    this.prevOutput2 = this.prevOutput1
    this.prevOutput1 = filteredSample

    return filteredSample
  }

  filterSamplesInPlace(samples: Float32Array) {
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]
      if (sample === undefined) {
        throw new Error(`sample at index ${i} not found`)
      }
      samples[i] = this.filter(sample)
    }
  }

  reset() {
    this.prevInput1 = 0
    this.prevInput2 = 0
    this.prevOutput1 = 0
    this.prevOutput2 = 0
  }

  setCoefficients(coefficients: FilterCoefficients) {
    this.b0 = coefficients.b0
    this.b1 = coefficients.b1
    this.b2 = coefficients.b2
    this.a1 = coefficients.a1
    this.a2 = coefficients.a2
  }
}

function getFilterCoefficients(
  filterType: FilterType,
  sampleRate: number,
  centerFrequency: number,
  q: number,
  gain: number,
) {
  const nyquistFrequency = sampleRate / 2
  const freqRatio = clamp(centerFrequency / nyquistFrequency, 0, 1)

  return filterCoefficientsFunction[filterType](freqRatio, q, gain)
}

function getLowpassFilterCoefficients(
  freqRatio: number,
  q: number,
  _gain: number,
): FilterCoefficients {
  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number

  if (freqRatio == 1) {
    b0 = 1
    b1 = 0
    b2 = 0
    a0 = 1
    a1 = 0
    a2 = 0
  } else {
    const theta = Math.PI * freqRatio
    const alpha = Math.sin(theta) / (2 * Math.pow(10, q / 20))
    const cosw = Math.cos(theta)
    const beta = (1 - cosw) / 2

    b0 = beta
    b1 = 2 * beta
    b2 = beta
    a0 = 1 + alpha
    a1 = -2 * cosw
    a2 = 1 - alpha
  }

  return normalizeFilterCoefficients(b0, b1, b2, a0, a1, a2)
}

function getHighpassFilterCoefficients(
  freqRatio: number,
  q: number,
  _gain: number,
): FilterCoefficients {
  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number

  if (freqRatio == 1) {
    b0 = 0
    b1 = 0
    b2 = 0
    a0 = 1
    a1 = 0
    a2 = 0
  } else if (freqRatio == 0) {
    b0 = 1
    b1 = 0
    b2 = 0
    a0 = 1
    a1 = 0
    a2 = 0
  } else {
    const theta = Math.PI * freqRatio
    const alpha = Math.sin(theta) / (2 * Math.pow(10, q / 20))
    const cosw = Math.cos(theta)
    const beta = (1 + cosw) / 2

    b0 = beta
    b1 = -2 * beta
    b2 = beta
    a0 = 1 + alpha
    a1 = -2 * cosw
    a2 = 1 - alpha
  }

  return normalizeFilterCoefficients(b0, b1, b2, a0, a1, a2)
}

function getBandpassFilterCoefficients(
  freqRatio: number,
  q: number,
  _gain: number = 0,
): FilterCoefficients {
  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number

  let coefficients: FilterCoefficients

  if (freqRatio > 0 && freqRatio < 1) {
    const w0 = Math.PI * freqRatio

    if (q > 0) {
      const alpha = Math.sin(w0) / (2 * q)
      const k = Math.cos(w0)

      b0 = alpha
      b1 = 0
      b2 = -alpha
      a0 = 1 + alpha
      a1 = -2 * k
      a2 = 1 - alpha

      coefficients = normalizeFilterCoefficients(b0, b1, b2, a0, a1, a2)
    } else {
      coefficients = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
    }
  } else {
    coefficients = { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 }
  }

  return coefficients
}

function getLowShelfFilterCoefficients(
  freqRatio: number,
  _q: number = 0,
  gain: number,
): FilterCoefficients {
  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number

  let coefficients: FilterCoefficients

  const S = 1
  const A = Math.pow(10, gain / 40)

  if (freqRatio == 1) {
    coefficients = { b0: A * A, b1: 0, b2: 0, a1: 0, a2: 0 }
  } else if (freqRatio == 0) {
    coefficients = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
  } else {
    const w0 = Math.PI * freqRatio
    const alpha =
      (1 / 2) * Math.sin(w0) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2)
    const k = Math.cos(w0)
    const k2 = 2 * Math.sqrt(A) * alpha
    const Ap1 = A + 1
    const Am1 = A - 1

    b0 = A * (Ap1 - Am1 * k + k2)
    b1 = 2 * A * (Am1 - Ap1 * k)
    b2 = A * (Ap1 - Am1 * k - k2)
    a0 = Ap1 + Am1 * k + k2
    a1 = -2 * (Am1 + Ap1 * k)
    a2 = Ap1 + Am1 * k - k2

    coefficients = normalizeFilterCoefficients(b0, b1, b2, a0, a1, a2)
  }

  return coefficients
}

function getHighShelfFilterCoefficients(
  freqRatio: number,
  _q: number = 0,
  gain: number,
): FilterCoefficients {
  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number

  let coefficients: FilterCoefficients

  const A = Math.pow(10, gain / 40)

  if (freqRatio == 1) {
    coefficients = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
  } else if (freqRatio > 0) {
    const w0 = Math.PI * freqRatio
    const S = 1
    const alpha = 0.5 * Math.sin(w0) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2)
    const k = Math.cos(w0)
    const k2 = 2 * Math.sqrt(A) * alpha
    const Ap1 = A + 1
    const Am1 = A - 1

    b0 = A * (Ap1 + Am1 * k + k2)
    b1 = -2 * A * (Am1 + Ap1 * k)
    b2 = A * (Ap1 + Am1 * k - k2)
    a0 = Ap1 - Am1 * k + k2
    a1 = 2 * (Am1 - Ap1 * k)
    a2 = Ap1 - Am1 * k - k2

    coefficients = normalizeFilterCoefficients(b0, b1, b2, a0, a1, a2)
  } else {
    coefficients = { b0: A * A, b1: 0, b2: 0, a1: 0, a2: 0 }
  }

  return coefficients
}

function getPeakingFilterCoefficients(
  freqRatio: number,
  q: number,
  gain: number,
): FilterCoefficients {
  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number

  let coefficients: FilterCoefficients

  const A = Math.pow(10, gain / 40)

  if (freqRatio > 0 && freqRatio < 1) {
    if (q > 0) {
      const w0 = Math.PI * freqRatio
      const alpha = Math.sin(w0) / (2 * q)
      const k = Math.cos(w0)

      b0 = 1 + alpha * A
      b1 = -2 * k
      b2 = 1 - alpha * A
      a0 = 1 + alpha / A
      a1 = -2 * k
      a2 = 1 - alpha / A

      coefficients = normalizeFilterCoefficients(b0, b1, b2, a0, a1, a2)
    } else {
      coefficients = { b0: A * A, b1: 0, b2: 0, a1: 0, a2: 0 }
    }
  } else {
    coefficients = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
  }

  return coefficients
}

function getNotchFilterCoefficients(
  freqRatio: number,
  q: number,
  _gain: number,
): FilterCoefficients {
  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number

  let coefficients: FilterCoefficients

  if (freqRatio > 0 && freqRatio < 1) {
    if (q > 0) {
      const w0 = Math.PI * freqRatio
      const alpha = Math.sin(w0) / (2 * q)
      const k = Math.cos(w0)

      b0 = 1
      b1 = -2 * k
      b2 = 1
      a0 = 1 + alpha
      a1 = -2 * k
      a2 = 1 - alpha

      coefficients = normalizeFilterCoefficients(b0, b1, b2, a0, a1, a2)
    } else {
      coefficients = { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 }
    }
  } else {
    coefficients = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
  }

  return coefficients
}

function getAllpassFilterCoefficients(
  freqRatio: number,
  q: number,
  _gain: number,
): FilterCoefficients {
  let b0: number
  let b1: number
  let b2: number
  let a0: number
  let a1: number
  let a2: number

  let coefficients: FilterCoefficients

  if (freqRatio > 0 && freqRatio < 1) {
    if (q > 0) {
      const w0 = Math.PI * freqRatio
      const alpha = Math.sin(w0) / (2 * q)
      const k = Math.cos(w0)

      b0 = 1 - alpha
      b1 = -2 * k
      b2 = 1 + alpha
      a0 = 1 + alpha
      a1 = -2 * k
      a2 = 1 - alpha

      coefficients = normalizeFilterCoefficients(b0, b1, b2, a0, a1, a2)
    } else {
      coefficients = { b0: -1, b1: 0, b2: 0, a1: 0, a2: 0 }
    }
  } else {
    coefficients = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
  }

  return coefficients
}

function normalizeFilterCoefficients(
  b0: number,
  b1: number,
  b2: number,
  a0: number,
  a1: number,
  a2: number,
): FilterCoefficients {
  const scale = 1 / a0

  return {
    b0: b0 * scale,
    b1: b1 * scale,
    b2: b2 * scale,
    a1: a1 * scale,
    a2: a2 * scale,
  }
}

function clamp(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num))
}

const filterCoefficientsFunction = {
  lowpass: getLowpassFilterCoefficients,
  highpass: getHighpassFilterCoefficients,
  bandpass: getBandpassFilterCoefficients,
  lowshelf: getLowShelfFilterCoefficients,
  highshelf: getHighShelfFilterCoefficients,
  peaking: getPeakingFilterCoefficients,
  notch: getNotchFilterCoefficients,
  allpass: getAllpassFilterCoefficients,
} as const satisfies Record<
  FilterType,
  (freqRatio: number, q: number, gain: number) => FilterCoefficients
>

type FilterType =
  | "lowpass"
  | "highpass"
  | "bandpass"
  | "lowshelf"
  | "highshelf"
  | "peaking"
  | "notch"
  | "allpass"

type FilterCoefficients = {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

class SmoothEstimator {
  estimate: number

  constructor(
    public readonly positiveAdaptationRate: number,
    public readonly negativeAdaptationRate: number,
    initialEstimate = 0.0,
  ) {
    this.estimate = initialEstimate
  }

  update(target: number, adaptaionRateFactor = 1.0) {
    const residual = target - this.estimate

    const adaptationRate =
      residual >= 0 ? this.positiveAdaptationRate : this.negativeAdaptationRate

    const stepSize = residual * adaptationRate * adaptaionRateFactor

    this.estimate += stepSize
  }

  updateDamped(
    target: number,
    dampingReference: number,
    dampingCurvature: number,
    adaptationRateFactor = 1.0,
  ) {
    const residual = target - this.estimate

    const scaledResidualMagnitude = Math.abs(residual) * dampingCurvature

    const dampingFactor =
      scaledResidualMagnitude / (scaledResidualMagnitude + dampingReference)

    const adaptationRate =
      residual >= 0 ? this.positiveAdaptationRate : this.negativeAdaptationRate

    const stepSize =
      residual * adaptationRate * adaptationRateFactor * dampingFactor

    this.estimate += stepSize
  }
}

class KWeightingFilter {
  readonly highShelfFilter: BiquadFilter
  readonly highPassFilter: BiquadFilter

  constructor(
    public readonly sampleRate: number,
    public readonly useStandard44100Filters = false,
  ) {
    if (useStandard44100Filters) {
      this.highShelfFilter = new BiquadFilter({
        b0: 1.53512485958697,
        b1: -2.69169618940638,
        b2: 1.19839281085285,
        a1: -1.69065929318241,
        a2: 0.73248077421585,
      })

      this.highPassFilter = new BiquadFilter({
        b0: 1.0,
        b1: -2.0,
        b2: 1.0,
        a1: -1.99004745483398,
        a2: 0.99007225036621,
      })
    } else {
      this.highShelfFilter = createHighshelfFilter(sampleRate, 2000.0, 4.0)
      this.highPassFilter = createHighpassFilter(sampleRate, 1.5, 0.01)
    }
  }

  process(sample: number): number {
    let outputSample = sample

    outputSample = this.highShelfFilter.filter(outputSample)
    outputSample = this.highPassFilter.filter(outputSample)

    return outputSample
  }
}

function gainFactorToDecibels(gainFactor: number) {
  return gainFactor <= 0.00001 ? -100 : 20.0 * Math.log10(gainFactor)
}

function decibelsToGainFactor(decibels: number) {
  return decibels <= -100.0 ? 0 : Math.pow(10, 0.05 * decibels)
}

function decodeWaveToFloat32Channels(
  waveData: Uint8Array,
  ignoreTruncatedChunks = true,
  ignoreOverflowingDataChunks = true,
) {
  const {
    decodedAudioBuffer,
    sampleRate,
    channelCount,
    bitDepth,
    sampleFormat,
  } = decodeWaveToBuffer(
    waveData,
    ignoreTruncatedChunks,
    ignoreOverflowingDataChunks,
  )
  const audioChannels = bufferToFloat32Channels(
    decodedAudioBuffer,
    channelCount,
    bitDepth,
    sampleFormat,
  )
  return {
    audioChannels,
    sampleRate,
  }
}
function decodeWaveToBuffer(
  waveData: Uint8Array,
  ignoreTruncatedChunks = true,
  ignoreOverflowingDataChunks = true,
) {
  let readOffset = 0
  const riffId = decodeAscii(waveData.subarray(readOffset, readOffset + 4))
  if (riffId !== "RIFF") {
    throw new Error("Not a valid wave file. No RIFF id found at offset 0.")
  }
  readOffset += 4
  let riffChunkSize = readUint32LE(waveData, readOffset)
  readOffset += 4
  const waveId = decodeAscii(waveData.subarray(readOffset, readOffset + 4))
  if (waveId !== "WAVE") {
    throw new Error("Not a valid wave file. No WAVE id found at offset 8.")
  }
  if (ignoreOverflowingDataChunks && riffChunkSize === 4294967295) {
    riffChunkSize = waveData.length - 8
  }
  if (riffChunkSize < waveData.length - 8) {
    throw new Error(
      `RIFF chunk length ${riffChunkSize} is smaller than the remaining size of the buffer (${waveData.length - 8})`,
    )
  }
  if (!ignoreTruncatedChunks && riffChunkSize > waveData.length - 8) {
    throw new Error(
      `RIFF chunk length (${riffChunkSize}) is greater than the remaining size of the buffer (${waveData.length - 8})`,
    )
  }
  readOffset += 4
  let formatSubChunkBodyBuffer
  const dataBuffers = [] as Uint8Array[]
  while (true) {
    const subChunkIdentifier = decodeAscii(
      waveData.subarray(readOffset, readOffset + 4),
    )
    readOffset += 4
    let subChunkSize = readUint32LE(waveData, readOffset)
    readOffset += 4
    if (!ignoreTruncatedChunks && subChunkSize > waveData.length - readOffset) {
      throw new Error(
        `Encountered a '${subChunkIdentifier}' subchunk with a size of ${subChunkSize} which is greater than the remaining size of the buffer (${waveData.length - readOffset})`,
      )
    }
    if (subChunkIdentifier === "fmt ") {
      formatSubChunkBodyBuffer = waveData.subarray(
        readOffset,
        readOffset + subChunkSize,
      )
    } else if (subChunkIdentifier === "data") {
      if (!formatSubChunkBodyBuffer) {
        throw new Error(
          "A data subchunk was encountered before a format subchunk",
        )
      }
      if (ignoreOverflowingDataChunks && subChunkSize === 4294967295) {
        subChunkSize = waveData.length - readOffset
      }
      const subChunkData = waveData.subarray(
        readOffset,
        readOffset + subChunkSize,
      )
      dataBuffers.push(subChunkData)
    }
    readOffset += subChunkSize
    if (readOffset >= waveData.length) {
      break
    }
  }
  if (!formatSubChunkBodyBuffer) {
    throw new Error("No format subchunk was found in the wave file")
  }
  if (dataBuffers.length === 0) {
    throw new Error("No data subchunks were found in the wave file")
  }
  const waveFormat = WaveFormatHeader.deserializeFrom(formatSubChunkBodyBuffer)
  const sampleFormat = waveFormat.sampleFormat
  const channelCount = waveFormat.channelCount
  const sampleRate = waveFormat.sampleRate
  const bitDepth = waveFormat.bitDepth
  const speakerPositionMask = waveFormat.speakerPositionMask
  const decodedAudioBuffer = concatUint8Arrays(dataBuffers)
  return {
    decodedAudioBuffer,
    sampleRate,
    channelCount,
    bitDepth,
    sampleFormat,
    speakerPositionMask,
  }
}
function concatUint8Arrays(arrays: Uint8Array[]) {
  return concatTypedArrays<Uint8Array>(Uint8Array, arrays)
}

function concatTypedArrays<T extends TypedArray>(
  TypedArrayConstructor: TypedArrayConstructor<T>,
  arrays: T[],
) {
  let totalLength = 0

  for (const array of arrays) {
    totalLength += array.length
  }

  const result = new TypedArrayConstructor(totalLength)

  let writeOffset = 0

  for (const array of arrays) {
    result.set(array, writeOffset)

    writeOffset += array.length
  }

  return result
}
function readUint16LE(buffer: Uint8Array, offset: number) {
  const byte0 = buffer[offset]
  const byte1 = buffer[offset + 1]
  if (byte0 === undefined || byte1 === undefined) {
    throw new Error(`buffer access out of bounds at offset ${offset}`)
  }
  return byte0 | (byte1 << 8)
}

function writeUint16LE(buffer: Uint8Array, value: number, offset: number) {
  if (value < 0 || value > 65535) {
    throw new Error(
      `Value ${value} is outside the range of a 16-bit unsigned integer`,
    )
  }

  buffer[offset] = value & 0xff
  buffer[offset + 1] = (value >>> 8) & 0xff
}

function readUint32LE(buffer: Uint8Array, offset: number) {
  return readInt32LE(buffer, offset) >>> 0
}

function writeUint32LE(buffer: Uint8Array, value: number, offset: number) {
  if (value < 0 || value > 4294967295) {
    throw new Error(
      `Value ${value} is outside the range of a 32-bit unsigned integer`,
    )
  }

  buffer[offset] = value & 0xff
  buffer[offset + 1] = (value >>> 8) & 0xff
  buffer[offset + 2] = (value >>> 16) & 0xff
  buffer[offset + 3] = (value >>> 24) & 0xff
}

class WaveFormatHeader {
  sampleFormat: (typeof SampleFormat)[keyof typeof SampleFormat] // 2 bytes LE
  channelCount: number // 2 bytes LE
  sampleRate: number // 4 bytes LE
  get byteRate() {
    return this.sampleRate * this.bytesPerSample * this.channelCount
  } // 4 bytes LE
  get blockAlign() {
    return this.bytesPerSample * this.channelCount
  } // 2 bytes LE
  bitDepth // 2 bytes LE
  speakerPositionMask // 4 bytes LE
  get guid() {
    return sampleFormatToGuid[this.sampleFormat]
  } // 16 bytes BE
  get bytesPerSample() {
    return this.bitDepth / 8
  }
  constructor(
    channelCount: number,
    sampleRate: number,
    bitDepth: number,
    sampleFormat: (typeof SampleFormat)[keyof typeof SampleFormat],
    speakerPositionMask = 0,
  ) {
    this.sampleFormat = sampleFormat
    this.channelCount = channelCount
    this.sampleRate = sampleRate
    this.bitDepth = bitDepth
    this.speakerPositionMask = speakerPositionMask
  }
  serialize(useExtensibleFormat: boolean) {
    const sampleFormatId = this.sampleFormat
    const serializedSize = sampleFormatToSerializedSize[sampleFormatId]
    const result = new Uint8Array(serializedSize)
    writeAscii(result, "fmt ", 0) // + 4
    writeUint32LE(result, serializedSize - 8, 4) // + 4
    writeUint16LE(result, sampleFormatId, 8) // + 2
    writeUint16LE(result, this.channelCount, 10) // + 2
    writeUint32LE(result, this.sampleRate, 12) // + 4
    writeUint32LE(result, this.byteRate, 16) // + 4
    writeUint16LE(result, this.blockAlign, 20) // + 2
    writeUint16LE(result, this.bitDepth, 22) // + 2
    if (useExtensibleFormat) {
      writeUint16LE(result, serializedSize - 26, 24) // + 2 (extension size)
      writeUint16LE(result, this.bitDepth, 26) // + 2 (valid bits per sample)
      writeUint32LE(result, this.speakerPositionMask, 28) // + 2 (speaker position mask)
      if (this.guid) {
        result.set(decodeHex(this.guid), 32)
      } else {
        throw new Error(
          `Extensible format is not supported for sample format ${this.sampleFormat}`,
        )
      }
    }
    return result
  }
  static deserializeFrom(formatChunkBody: Uint8Array) {
    let sampleFormat = readUint16LE(formatChunkBody, 0) // + 2
    const channelCount = readUint16LE(formatChunkBody, 2) // + 2
    const sampleRate = readUint32LE(formatChunkBody, 4) // + 4
    const bitDepth = readUint16LE(formatChunkBody, 14)
    let speakerPositionMask = 0
    if (sampleFormat === 65534) {
      if (formatChunkBody.length < 40) {
        throw new Error(
          `Format subchunk specifies a format id of 65534 (extensible) but its body size is ${formatChunkBody.length} bytes, which is smaller than the minimum expected of 40 bytes`,
        )
      }
      speakerPositionMask = readUint16LE(formatChunkBody, 20)
      const guid = encodeHex(formatChunkBody.subarray(24, 40))
      if (guid === sampleFormatToGuid[SampleFormat.PCM]) {
        sampleFormat = SampleFormat.PCM
      } else if (guid === sampleFormatToGuid[SampleFormat.Float]) {
        sampleFormat = SampleFormat.Float
      } else if (guid === sampleFormatToGuid[SampleFormat.Alaw]) {
        sampleFormat = SampleFormat.Alaw
      } else if (guid === sampleFormatToGuid[SampleFormat.Mulaw]) {
        sampleFormat = SampleFormat.Mulaw
      } else {
        throw new Error(
          `Unsupported format GUID in extended format subchunk: ${guid}`,
        )
      }
    }
    if (sampleFormat === SampleFormat.PCM) {
      if (
        bitDepth !== 8 &&
        bitDepth !== 16 &&
        bitDepth !== 24 &&
        bitDepth !== 32
      ) {
        throw new Error(
          `PCM audio has a bit depth of ${bitDepth}, which is not supported`,
        )
      }
    } else if (sampleFormat === SampleFormat.Float) {
      if (bitDepth !== 32 && bitDepth !== 64) {
        throw new Error(
          `IEEE float audio has a bit depth of ${bitDepth}, which is not supported`,
        )
      }
    } else if (sampleFormat === SampleFormat.Alaw) {
      if (bitDepth !== 8) {
        throw new Error(
          `Alaw audio has a bit depth of ${bitDepth}, which is not supported`,
        )
      }
    } else if (sampleFormat === SampleFormat.Mulaw) {
      if (bitDepth !== 8) {
        throw new Error(
          `Mulaw audio has a bit depth of ${bitDepth}, which is not supported`,
        )
      }
    } else {
      throw new Error(`Wave audio format id ${sampleFormat} is not supported`)
    }
    return new WaveFormatHeader(
      channelCount,
      sampleRate,
      bitDepth,
      sampleFormat,
      speakerPositionMask,
    )
  }
}

const SampleFormat = {
  PCM: 1,
  Float: 3,
  Alaw: 6,
  Mulaw: 7,
} as const
const sampleFormatToSerializedSize = {
  [SampleFormat.PCM]: 24,
  [SampleFormat.Float]: 26,
  [SampleFormat.Alaw]: 26,
  [SampleFormat.Mulaw]: 26,
  65534: 48,
}
const sampleFormatToGuid = {
  [SampleFormat.PCM]: "0100000000001000800000aa00389b71",
  [SampleFormat.Float]: "0300000000001000800000aa00389b71",
  [SampleFormat.Alaw]: "0600000000001000800000aa00389b71",
  [SampleFormat.Mulaw]: "0700000000001000800000aa00389b71",
}

function bufferToFloat32Channels(
  audioBuffer: Uint8Array,
  channelCount: number,
  sourceBitDepth: number,
  sourceSampleFormat: (typeof SampleFormat)[keyof typeof SampleFormat],
) {
  let interleavedChannels

  if (sourceSampleFormat === SampleFormat.PCM && sourceBitDepth === 16) {
    interleavedChannels = int16PcmToFloat32(bytesLEToInt16Array(audioBuffer))
  } else {
    throw new Error(`Unsupported PCM bit depth: ${sourceBitDepth}`)
  }
  audioBuffer = new Uint8Array(0) // Zero the reference to allow the GC to free up memory, if possible
  return deinterleaveChannels(interleavedChannels, channelCount)
}

function readInt32LE(buffer: Uint8Array, offset: number) {
  const byte0 = buffer[offset]
  const byte1 = buffer[offset + 1]
  const byte2 = buffer[offset + 2]
  const byte3 = buffer[offset + 3]
  if (
    byte0 === undefined ||
    byte1 === undefined ||
    byte2 === undefined ||
    byte3 === undefined
  ) {
    throw new Error(`buffer access out of bounds at offset ${offset}`)
  }
  const value = byte0 | (byte1 << 8) | (byte2 << 16) | (byte3 << 24)

  return value
}
function interleaveChannels(channels: Float32Array[]) {
  const channelCount = channels.length
  const firstChannel = channels[0]
  if (!firstChannel) {
    throw new Error("Empty channel array received")
  }
  if (channelCount === 1) {
    return firstChannel
  }
  const sampleCount = firstChannel.length
  const result = new Float32Array(sampleCount * channelCount)
  let writeIndex = 0
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
      const channel = channels[channelIndex]
      if (!channel) {
        throw new Error(`channel ${channelIndex} not found`)
      }
      const sample = channel[sampleIndex]
      if (sample === undefined) {
        throw new Error(
          `sample at index ${sampleIndex} not found in channel ${channelIndex}`,
        )
      }
      result[writeIndex++] = sample
    }
  }
  return result
}
function deinterleaveChannels(
  interleavedChannels: Float32Array,
  channelCount: number,
) {
  if (channelCount < 1) {
    throw new Error(
      `Invalid channel count of ${channelCount} received, which is smaller than 1`,
    )
  }
  if (channelCount === 1) {
    return [interleavedChannels]
  }
  if (interleavedChannels.length % channelCount !== 0) {
    throw new Error(
      `Size of interleaved channels (${interleaveChannels.length}) is not a multiple of channel count (${channelCount})`,
    )
  }
  const sampleCount = interleavedChannels.length / channelCount
  const channels = []
  for (let i = 0; i < channelCount; i++) {
    channels.push(new Float32Array(sampleCount))
  }
  let readIndex = 0
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
      const channel = channels[channelIndex]
      if (!channel) {
        throw new Error(`channel ${channelIndex} not found`)
      }
      const sample = interleavedChannels[readIndex++]
      if (sample === undefined) {
        throw new Error(
          `interleaved sample at index ${readIndex - 1} not found`,
        )
      }
      channel[sampleIndex] = sample
    }
  }
  return channels
}
function int16PcmToFloat32(input: Int16Array) {
  const sampleCount = input.length
  const output = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    const sample = input[i]
    if (sample === undefined) {
      throw new Error(`input sample at index ${i} not found`)
    }
    output[i] = sample * (1 / 32768)
  }
  return output
}
function writeAscii(
  buffer: Uint8Array,
  asciiString: string,
  writeStartOffset: number,
) {
  const writeEndOffset = Math.min(
    writeStartOffset + asciiString.length,
    buffer.length,
  )

  let readOffset = 0
  let writeOffset = writeStartOffset

  while (writeOffset < writeEndOffset) {
    const charCode = asciiString.charCodeAt(readOffset++)

    if (charCode >= 128) {
      throw new Error(
        `Character '${asciiString[readOffset]}' (code: ${charCode}) at offset ${readOffset} can't be encoded as ASCII`,
      )
    }

    buffer[writeOffset++] = charCode
  }
}

const isLittleEndianArch = testIfLittleEndian()

function testIfLittleEndian() {
  const uint16Array = new Uint16Array([0x11_22])
  const bytes = new Uint8Array(uint16Array.buffer)

  return bytes[0] === 0x22
}

function reverseByteGroups(bytes: Uint8Array, groupSize: number) {
  const result = bytes.slice()
  reverseByteGroupsInPlace(result, groupSize)

  return result
}

function reverseByteGroupsInPlace(bytes: Uint8Array, groupSize: number) {
  if (bytes.length % groupSize !== 0) {
    throw new Error(`Byte count must be an integer multiple of the group size.`)
  }

  const halfGroupSize = Math.floor(groupSize / 2)

  for (let offset = 0; offset < bytes.length; offset += groupSize) {
    const groupFirstElementOffset = offset
    const groupLastElementOffset = offset + groupSize - 1

    for (let i = 0; i < halfGroupSize; i++) {
      const offset1 = groupFirstElementOffset + i
      const offset2 = groupLastElementOffset - i
      const valueAtOffset1 = bytes[offset1]
      const valueAtOffset2 = bytes[offset2]
      if (valueAtOffset1 === undefined || valueAtOffset2 === undefined) {
        throw new Error(
          `bytes access out of bounds at offsets ${offset1}, ${offset2}`,
        )
      }
      bytes[offset1] = valueAtOffset2
      bytes[offset2] = valueAtOffset1
    }
  }
}

function reverseByteGroupsIfBigEndian(
  bytes: Uint8Array,
  groupSize: number,
): Uint8Array {
  if (isLittleEndianArch) {
    return bytes
  } else {
    return reverseByteGroups(bytes, groupSize)
  }
}

function bytesLEToInt16Array(bytes: Uint8Array) {
  bytes = reverseByteGroupsIfBigEndian(bytes, 2)

  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
}

class DynamicTypedArray<T extends TypedArray> {
  elements: TypedArray
  length = 0

  constructor(
    private TypedArrayConstructor: TypedArrayConstructor<T>,
    initialCapacity = 4,
  ) {
    this.elements = new TypedArrayConstructor(initialCapacity)
  }

  add(newElement: number) {
    const newLength = this.length + 1

    if (newLength > this.capacity) {
      this.ensureCapacity(newLength)
    }

    this.elements[this.length] = newElement
    this.length = newLength
  }

  addMany(...newElements: number[]) {
    this.addArray(newElements)
  }

  addArray(newElements: ArrayLike<number>) {
    const newLength = this.length + newElements.length

    if (newLength > this.capacity) {
      this.ensureCapacity(newLength)
    }

    this.elements.set(newElements, this.length)
    this.length = newLength
  }

  ensureCapacity(requiredCapacity: number) {
    if (requiredCapacity > this.capacity) {
      const newCapacity = requiredCapacity * 2

      const newElements = new this.TypedArrayConstructor(newCapacity)
      newElements.set(this.toTypedArray())

      this.elements = newElements
    }
  }

  get capacity() {
    return this.elements.length
  }

  toTypedArray() {
    return this.elements.subarray(0, this.length) as T
  }

  clear() {
    this.length = 0
  }
}

function createDynamicUint8Array(initialCapacity?: number): DynamicUint8Array {
  return new DynamicTypedArray<Uint8Array>(Uint8Array, initialCapacity)
}

export function createDynamicUint16Array(
  initialCapacity?: number,
): DynamicUint16Array {
  return new DynamicTypedArray<Uint16Array>(Uint16Array, initialCapacity)
}

type DynamicUint8Array = DynamicTypedArray<Uint8Array>
type DynamicUint16Array = DynamicTypedArray<Uint16Array>

async function readFileAsBinary(filePath: string) {
  const chunkSize = 2 ** 20

  const fileInfo = await stat(filePath)
  const fileSize = fileInfo.size

  const fileReader = new FileReader(filePath)
  const buffer = new Uint8Array(chunkSize)
  const result = createDynamicUint8Array(fileSize)

  while (!fileReader.isFinished) {
    const chunk = await fileReader.readChunk(buffer)

    result.addArray(chunk)
  }

  return result.toTypedArray()
}
class FileReader {
  private fileHandle: FileHandle | undefined
  private finished = false
  private disposed = false
  private readOffset = 0

  constructor(public readonly filePath: string) {}

  async readChunk(buffer: Uint8Array): Promise<Uint8Array> {
    if (this.isDisposed) {
      throw new Error(`FileReader has been disposed`)
    }

    await this.openIfNeeded()

    let bufferWriteOffset = 0

    while (bufferWriteOffset < buffer.length) {
      const remainingSizeInBuffer = buffer.length - bufferWriteOffset

      let bytesRead: number

      try {
        ;({ bytesRead } = await this.fileHandle!.read(buffer, {
          offset: bufferWriteOffset,
          length: remainingSizeInBuffer,
          position: this.readOffset,
        }))
      } catch (e) {
        await this.dispose()

        throw e
      }

      if (bytesRead === 0) {
        this.finished = true

        await this.dispose()

        break
      }

      bufferWriteOffset += bytesRead
      this.readOffset += bytesRead
    }

    return buffer.subarray(0, bufferWriteOffset)
  }

  private async openIfNeeded() {
    if (this.isDisposed) {
      throw new Error(`FileReader has been disposed`)
    }

    if (this.isOpened) {
      return
    }

    this.fileHandle = await open(this.filePath, "r")
  }

  async dispose() {
    if (this.isDisposed) {
      return
    }

    if (this.isOpened) {
      try {
        await this.fileHandle!.close()
      } catch (_e) {
        //
      }
    }

    this.disposed = true
    this.readOffset = 0
    this.fileHandle = undefined
  }

  get isOpened() {
    return this.fileHandle !== undefined
  }

  get isDisposed() {
    return this.disposed
  }

  get isFinished() {
    return this.finished
  }
}

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array

interface TypedArrayConstructor<T extends TypedArray> {
  new (length: number): T
}

function encodeHex(buffer: Uint8Array) {
  const asciiBuffer = encodeHexAsAsciiBuffer(buffer)

  return decodeAscii(asciiBuffer)
}

function encodeHexAsAsciiBuffer(buffer: Uint8Array) {
  const bufferLen = buffer.length

  const charCodes = new Uint8Array(bufferLen * 2)

  let readOffset = 0
  let writeOffset = 0

  while (readOffset < bufferLen) {
    const value = buffer[readOffset++]
    if (value === undefined) {
      throw new Error(`buffer value at offset ${readOffset - 1} not found`)
    }

    const valueHigh4Bits = (value >>> 4) & 0xf
    const valueLow4Bits = value & 0xf

    const highCharCode = hexCharCodeLookup[valueHigh4Bits]
    const lowCharCode = hexCharCodeLookup[valueLow4Bits]
    if (highCharCode === undefined || lowCharCode === undefined) {
      throw new Error(`hex char code lookup failed for value ${value}`)
    }
    charCodes[writeOffset++] = highCharCode
    charCodes[writeOffset++] = lowCharCode
  }

  return charCodes
}

function decodeHex(hexString: string) {
  const hexLength = hexString.length

  if (hexLength % 2 !== 0) {
    throw new Error(
      `Hexadecimal string doesn't have an even number of characters`,
    )
  }

  const buffer = new Uint8Array(hexLength / 2)

  let readOffset = 0
  let writeOffset = 0

  while (readOffset < hexLength) {
    const valueHigh4Bits = hexCharCodeToValue(
      hexString.charCodeAt(readOffset++),
    )
    const valueLow4Bits = hexCharCodeToValue(hexString.charCodeAt(readOffset++))

    const value = (valueHigh4Bits << 4) | valueLow4Bits

    buffer[writeOffset++] = value
  }

  return buffer
}

function hexCharCodeToValue(hexCharCode: number) {
  if (hexCharCode >= 48 && hexCharCode <= 57) {
    return hexCharCode - 48
  } else if (hexCharCode >= 97 && hexCharCode <= 102) {
    return 10 + hexCharCode - 97
  } else if (hexCharCode >= 65 && hexCharCode <= 70) {
    return 10 + hexCharCode - 65
  } else {
    throw new Error(
      `Can't decode character '${String.fromCharCode(hexCharCode)}' (code: ${hexCharCode}) as hexadecimal`,
    )
  }
}

const hexCharCodeLookup = new Uint8Array([
  48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102,
])
