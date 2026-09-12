export interface MelFrontendConfig {
  sampleRate: number
  melBins: number
  windowSamples: number
}

export interface MelFeatures {
  values: Float32Array
  frames: number
  melBins: number
}

export const HOP_SAMPLES = 160

const PRE_EMPHASIS = 0.97
const LOG_GUARD = 2 ** -24
const STD_GUARD = 1e-5
const MEL_LINEAR_HZ_PER_MEL = 200 / 3
const MEL_LOG_START_HZ = 1000
const MEL_LOG_START = MEL_LOG_START_HZ / MEL_LINEAR_HZ_PER_MEL
const MEL_LOG_STEP = Math.log(6.4) / 27

export function fftSizeFor(windowSamples: number): number {
  return 2 ** Math.ceil(Math.log2(windowSamples))
}

function hzToMel(hz: number): number {
  if (hz < MEL_LOG_START_HZ) return hz / MEL_LINEAR_HZ_PER_MEL
  return MEL_LOG_START + Math.log(hz / MEL_LOG_START_HZ) / MEL_LOG_STEP
}

function melToHz(mel: number): number {
  if (mel < MEL_LOG_START) return mel * MEL_LINEAR_HZ_PER_MEL
  return MEL_LOG_START_HZ * Math.exp(MEL_LOG_STEP * (mel - MEL_LOG_START))
}

export function slaneyMelFilters(
  sampleRate: number,
  fftSize: number,
  melBins: number,
): Float32Array {
  const bins = fftSize / 2 + 1
  const maxMel = hzToMel(sampleRate / 2)
  const edges = Array.from({ length: melBins + 2 }, (_, i) =>
    melToHz((maxMel * i) / (melBins + 1)),
  )
  const filters = new Float32Array(bins * melBins)
  for (let m = 0; m < melBins; m++) {
    const lower = edges[m] as number
    const centre = edges[m + 1] as number
    const upper = edges[m + 2] as number
    const norm = 2 / (upper - lower)
    for (let k = 0; k < bins; k++) {
      const hz = (k * sampleRate) / fftSize
      const rising = (hz - lower) / (centre - lower)
      const falling = (upper - hz) / (upper - centre)
      const weight = Math.max(0, Math.min(rising, falling))
      filters[k * melBins + m] = weight * norm
    }
  }
  return filters
}

export function hannWindow(
  windowSamples: number,
  fftSize: number,
): Float32Array {
  const window = new Float32Array(fftSize)
  for (let n = 0; n < windowSamples; n++) {
    window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / windowSamples)
  }
  return window
}

export function createRfft(size: number) {
  const levels = Math.log2(size)
  if (!Number.isInteger(levels)) {
    throw new Error(`FFT size ${size} is not a power of two`)
  }
  const reversed = new Uint32Array(size)
  for (let i = 0; i < size; i++) {
    let r = 0
    for (let b = 0; b < levels; b++) r = (r << 1) | ((i >> b) & 1)
    reversed[i] = r
  }
  const cos = new Float64Array(size / 2)
  const sin = new Float64Array(size / 2)
  for (let k = 0; k < size / 2; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / size)
    sin[k] = -Math.sin((2 * Math.PI * k) / size)
  }
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  const power = new Float64Array(size / 2 + 1)

  return function powerSpectrum(input: ArrayLike<number>): Float64Array {
    for (let i = 0; i < size; i++) {
      re[reversed[i] as number] = input[i] as number
      im[reversed[i] as number] = 0
    }
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1
      const step = size / len
      for (let start = 0; start < size; start += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step] as number
          const wi = sin[k * step] as number
          const a = start + k
          const b = a + half
          const br = re[b] as number
          const bi = im[b] as number
          const tr = br * wr - bi * wi
          const ti = br * wi + bi * wr
          re[b] = (re[a] as number) - tr
          im[b] = (im[a] as number) - ti
          re[a] = (re[a] as number) + tr
          im[a] = (im[a] as number) + ti
        }
      }
    }
    for (let k = 0; k <= size / 2; k++) {
      const r = re[k] as number
      const i = im[k] as number
      power[k] = r * r + i * i
    }
    return power
  }
}

export class MelFrontend {
  readonly fftSize: number
  readonly melBins: number
  private readonly filters: Float32Array
  private readonly window: Float32Array
  private readonly powerSpectrum: (input: ArrayLike<number>) => Float64Array

  constructor(config: MelFrontendConfig) {
    this.fftSize = fftSizeFor(config.windowSamples)
    this.melBins = config.melBins
    this.filters = slaneyMelFilters(
      config.sampleRate,
      this.fftSize,
      config.melBins,
    )
    this.window = hannWindow(config.windowSamples, this.fftSize)
    this.powerSpectrum = createRfft(this.fftSize)
  }

  get minSamples(): number {
    return this.fftSize * 4
  }

  features(samples: Float32Array): MelFeatures {
    const pad = this.fftSize / 2
    if (samples.length <= pad) {
      throw new Error(
        `Need more than ${pad} samples for mel features, got ${samples.length}`,
      )
    }

    const padded = new Float32Array(samples.length + 2 * pad)
    padded[pad] = samples[0] as number
    for (let i = 1; i < samples.length; i++) {
      padded[pad + i] =
        (samples[i] as number) - PRE_EMPHASIS * (samples[i - 1] as number)
    }
    for (let j = 1; j <= pad; j++) {
      padded[pad - j] = padded[pad + j] as number
      padded[pad + samples.length - 1 + j] = padded[
        pad + samples.length - 1 - j
      ] as number
    }

    const frames = 1 + Math.floor((padded.length - this.fftSize) / HOP_SAMPLES)
    const bins = this.fftSize / 2 + 1
    const melBins = this.melBins
    const frame = new Float64Array(this.fftSize)
    const values = new Float32Array(frames * melBins)
    const sum = new Float64Array(melBins)
    const sumSquares = new Float64Array(melBins)

    for (let f = 0; f < frames; f++) {
      const offset = f * HOP_SAMPLES
      for (let i = 0; i < this.fftSize; i++) {
        frame[i] = (padded[offset + i] as number) * (this.window[i] as number)
      }
      const power = this.powerSpectrum(frame)
      for (let m = 0; m < melBins; m++) {
        let energy = 0
        for (let k = 0; k < bins; k++) {
          energy +=
            (power[k] as number) * (this.filters[k * melBins + m] as number)
        }
        const value = Math.log(energy + LOG_GUARD)
        values[f * melBins + m] = value
        sum[m] = (sum[m] as number) + value
        sumSquares[m] = (sumSquares[m] as number) + value * value
      }
    }

    for (let m = 0; m < melBins; m++) {
      const mean = (sum[m] as number) / frames
      const variance =
        frames > 1
          ? ((sumSquares[m] as number) - frames * mean * mean) / (frames - 1)
          : 0
      const scale = Math.sqrt(Math.max(variance, 0)) + STD_GUARD
      for (let f = 0; f < frames; f++) {
        const index = f * melBins + m
        values[index] = ((values[index] as number) - mean) / scale
      }
    }

    return { values, frames, melBins }
  }
}
