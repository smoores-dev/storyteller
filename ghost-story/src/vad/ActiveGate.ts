import type { Readable } from "node:stream"

import { Converter } from "ffmpeg-stream"

export interface VadOptions {
  lowCutoff?: number
  highCutoff?: number
  positiveAdaptationRate?: number
  negativeAdaptationRate?: number
  peakLoudnessDecay?: number
  backwardExtensionDuration?: number
  relativeThreshold?: number
}

export const defaultVadOptions: Required<VadOptions> = {
  lowCutoff: 100,
  highCutoff: 1000,
  positiveAdaptationRate: 400.0,
  negativeAdaptationRate: 10.0,
  peakLoudnessDecay: 4.0,
  backwardExtensionDuration: 0.2,
  relativeThreshold: -15,
}

export interface VadSegment {
  startTime: number
  endTime: number
  isActive: boolean
}

export type RawAudio = {
  audioChannels: Float32Array[]
  sampleRate: number
}

export function detectVoiceActivity(
  rawAudio: RawAudio,
  options: VadOptions = {},
): VadSegment[] {
  const channelCount = rawAudio.audioChannels.length
  const firstChannel = rawAudio.audioChannels[0]

  if (!firstChannel || channelCount === 0) return []

  const vad = new StreamingVad(rawAudio.sampleRate, channelCount, options)

  for (let i = 0; i < firstChannel.length; i++) {
    for (let ch = 0; ch < channelCount; ch++) {
      const sample = rawAudio.audioChannels[ch]?.[i] ?? 0
      vad.process(sample, ch)
    }
  }

  return vad.finalize()
}

export interface StreamOptions extends VadOptions {
  sampleRate?: number
  channelCount?: number
}

const defaultStreamOptions = {
  sampleRate: 16000,
  channelCount: 1,
}

export async function vadFromFile(
  path: string,
  options: StreamOptions = {},
): Promise<VadSegment[]> {
  const converter = new Converter()
  converter.createInputFromFile(path)
  const outputStream = converter.createOutputStream({
    f: "f32le",
    ar: "16000",
    ac: "1",
    acodec: "pcm_f32le",
  })
  const segments: VadSegment[] = []

  const run = converter.run()
  try {
    for await (const seg of vadFromStream(outputStream, options)) {
      segments.push(seg)
    }
  } catch (error) {
    converter.kill()
    throw error
  } finally {
    await run
  }
  return segments
}

// process raw PCM f32le audio from a readable stream
// expects mono or interleaved multi-channel float32 little-endian samples
export async function* vadFromStream(
  stream: Readable,
  options: StreamOptions = {},
): AsyncGenerator<VadSegment> {
  const sampleRate = options.sampleRate ?? defaultStreamOptions.sampleRate
  const channelCount = options.channelCount ?? defaultStreamOptions.channelCount
  const vad = new StreamingVad(sampleRate, channelCount, options)

  let leftover = Buffer.alloc(0)

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    const combined = Buffer.concat([leftover, chunk])
    const bytesPerSample = 4
    const bytesPerFrame = bytesPerSample * channelCount
    const completeFrames = Math.floor(combined.length / bytesPerFrame)
    const usableBytes = completeFrames * bytesPerFrame

    for (let offset = 0; offset < usableBytes; offset += bytesPerFrame) {
      for (let ch = 0; ch < channelCount; ch++) {
        const sample = combined.readFloatLE(offset + ch * bytesPerSample)
        vad.process(sample, ch)
      }
    }

    leftover = combined.subarray(usableBytes)

    for (const seg of vad.flush()) {
      yield seg
    }
  }

  for (const seg of vad.flush(true)) {
    yield seg
  }
}

export class StreamingVad {
  private readonly opts: Required<VadOptions>
  private readonly channelFilters: ChannelFilter[]
  private readonly loudness: SmoothEstimator
  private readonly minLoudness: DecayingPeak
  private readonly maxLoudness: DecayingPeak
  private readonly frameDuration = 0.01
  private readonly ticksPerSecond: number
  private readonly backwardFrameCount: number

  private frameBuffer: Frame[] = []
  private currentSampleIndex = 0
  private emittedUpToTime = 0
  private pendingSegment: VadSegment | null = null

  constructor(
    public readonly sampleRate: number,
    public readonly channelCount: number,
    options: VadOptions = {},
  ) {
    this.opts = { ...defaultVadOptions, ...options }
    this.ticksPerSecond = sampleRate * channelCount
    this.backwardFrameCount = Math.ceil(
      this.opts.backwardExtensionDuration / this.frameDuration,
    )

    this.channelFilters = Array.from({ length: channelCount }, () => ({
      highpass: createBiquadFilter("highpass", sampleRate, this.opts.lowCutoff),
      lowpass: createBiquadFilter("lowpass", sampleRate, this.opts.highCutoff),
    }))

    const initialPower = dbToGain(-60) ** 2
    this.loudness = new SmoothEstimator(
      this.opts.positiveAdaptationRate / this.ticksPerSecond,
      this.opts.negativeAdaptationRate / this.ticksPerSecond,
      initialPower,
    )

    this.minLoudness = new DecayingPeak(
      "min",
      -60,
      this.opts.peakLoudnessDecay / this.ticksPerSecond,
    )
    this.maxLoudness = new DecayingPeak(
      "max",
      -60,
      this.opts.peakLoudnessDecay / this.ticksPerSecond,
    )
  }

  process(sample: number, channel: number) {
    const filter = this.channelFilters[channel]
    if (!filter) return

    sample = filter.highpass.process(sample)
    sample = filter.lowpass.process(sample)

    this.loudness.update(sample ** 2)
    const currentDb = gainToDb(
      Math.sqrt(Math.max(this.loudness.value, dbToGain(-60) ** 2)),
    )

    this.minLoudness.update(currentDb)
    if (currentDb >= -60) {
      this.maxLoudness.update(currentDb)
    }

    const time = this.currentSampleIndex / this.sampleRate
    const lastFrame = this.frameBuffer[this.frameBuffer.length - 1]

    if (!lastFrame || time > lastFrame.time + this.frameDuration) {
      this.frameBuffer.push({
        time,
        loudness: currentDb,
        maxLoudness: this.maxLoudness.value,
      })
    }

    if (channel === this.channelCount - 1) {
      this.currentSampleIndex++
    }
  }

  // flush finalized segments, keeping buffer for backward extension
  // call with final=true when done processing to get remaining segments
  flush(final = false): VadSegment[] {
    const segments: VadSegment[] = []
    const frameCount = this.frameBuffer.length

    if (frameCount === 0) return segments

    // determine how many frames we can finalize
    // we need to keep backwardFrameCount frames for potential backward extension
    const finalizeCount = final
      ? frameCount
      : Math.max(0, frameCount - this.backwardFrameCount)

    if (finalizeCount === 0) return segments

    // compute activity for frames we're finalizing using backward pass
    const active = this.computeActivity(finalizeCount, final)

    // emit segments
    for (let i = 0; i < finalizeCount; i++) {
      const frame = this.frameBuffer[i]
      if (!frame) continue

      const isActive = active[i] ?? false
      const startTime = frame.time
      const endTime = startTime + this.frameDuration

      if (this.pendingSegment && this.pendingSegment.isActive === isActive) {
        this.pendingSegment.endTime = endTime
      } else {
        if (this.pendingSegment) {
          segments.push(this.pendingSegment)
        }
        this.pendingSegment = { startTime, endTime, isActive }
      }
    }

    // if final, emit the last pending segment
    if (final && this.pendingSegment) {
      segments.push(this.pendingSegment)
      this.pendingSegment = null
    }

    // remove finalized frames from buffer
    this.frameBuffer.splice(0, finalizeCount)
    this.emittedUpToTime =
      segments[segments.length - 1]?.endTime ?? this.emittedUpToTime

    return segments
  }

  private computeActivity(count: number, includeBuffer: boolean): boolean[] {
    const active = new Array<boolean>(count).fill(false)

    // we need to look at frames beyond count for backward extension sources
    const lookAheadEnd = includeBuffer
      ? this.frameBuffer.length
      : Math.min(count + this.backwardFrameCount, this.frameBuffer.length)

    let extendTo = count

    // backward pass from the end of our look-ahead range
    for (let i = lookAheadEnd - 1; i >= 0; i--) {
      const frame = this.frameBuffer[i]
      if (!frame) continue

      const refLoudness = Math.max(frame.maxLoudness, -30)
      const isLoud = frame.loudness >= refLoudness + this.opts.relativeThreshold

      if (isLoud) {
        extendTo = Math.max(i - this.backwardFrameCount, 0)
      }

      // only mark frames within our finalize range
      if (i < count) {
        if (i >= extendTo || isLoud) {
          active[i] = true
        }
      }
    }

    return active
  }

  finalize(): VadSegment[] {
    const segments = this.flush(true)
    return segments
  }

  getSegments(): VadSegment[] {
    return this.flush(true)
  }

  // reset all state to process a new audio stream
  reset() {
    this.frameBuffer = []
    this.currentSampleIndex = 0
    this.emittedUpToTime = 0
    this.pendingSegment = null

    this.loudness.reset(dbToGain(-60) ** 2)
    this.minLoudness.reset(-60)
    this.maxLoudness.reset(-60)

    for (const filter of this.channelFilters) {
      filter.highpass.reset()
      filter.lowpass.reset()
    }
  }
}

interface Frame {
  time: number
  loudness: number
  maxLoudness: number
}

interface ChannelFilter {
  highpass: BiquadFilter
  lowpass: BiquadFilter
}

class SmoothEstimator {
  value: number

  constructor(
    private readonly upRate: number,
    private readonly downRate: number,
    initial: number,
  ) {
    this.value = initial
  }

  update(target: number) {
    const diff = target - this.value
    const rate = diff >= 0 ? this.upRate : this.downRate
    this.value += diff * rate
  }

  reset(value: number) {
    this.value = value
  }
}

class DecayingPeak {
  value: number

  constructor(
    private readonly kind: "min" | "max",
    initial: number,
    private readonly decay: number,
  ) {
    this.value = initial
  }

  update(v: number) {
    if (this.kind === "max") {
      this.value -= this.decay
      this.value = Math.max(v, this.value)
    } else {
      this.value += this.decay
      this.value = Math.min(v, this.value)
    }
  }

  reset(value: number) {
    this.value = value
  }
}

class BiquadFilter {
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0

  constructor(private readonly c: FilterCoeffs) {}

  process(x: number): number {
    const y =
      this.c.b0 * x +
      this.c.b1 * this.x1 +
      this.c.b2 * this.x2 -
      this.c.a1 * this.y1 -
      this.c.a2 * this.y2

    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y

    return y
  }

  reset() {
    this.x1 = 0
    this.x2 = 0
    this.y1 = 0
    this.y2 = 0
  }
}

interface FilterCoeffs {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

function createBiquadFilter(
  type: "lowpass" | "highpass",
  sampleRate: number,
  freq: number,
  q = 0.7071,
): BiquadFilter {
  const nyquist = sampleRate / 2
  const w = Math.min(freq / nyquist, 1)

  if (w === 1) {
    return new BiquadFilter(
      type === "lowpass"
        ? { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
        : { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 },
    )
  }

  if (w === 0 && type === "highpass") {
    return new BiquadFilter({ b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 })
  }

  const theta = Math.PI * w
  const alpha = Math.sin(theta) / (2 * Math.pow(10, q / 20))
  const cosw = Math.cos(theta)

  let b0: number, b1: number, b2: number
  if (type === "lowpass") {
    const beta = (1 - cosw) / 2
    b0 = beta
    b1 = 2 * beta
    b2 = beta
  } else {
    const beta = (1 + cosw) / 2
    b0 = beta
    b1 = -2 * beta
    b2 = beta
  }

  const a0 = 1 + alpha
  const a1 = -2 * cosw
  const a2 = 1 - alpha

  return new BiquadFilter({
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  })
}

function gainToDb(gain: number): number {
  return gain <= 0.00001 ? -100 : 20 * Math.log10(gain)
}

function dbToGain(db: number): number {
  return db <= -100 ? 0 : Math.pow(10, db / 20)
}
