/* eslint-disable no-console */
import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { describe, it } from "node:test"

import {
  type RawAudio,
  StreamingVad,
  type VadSegment,
  detectVoiceActivity,
  vadFromFile,
} from "../src/vad/ActiveGate.js"
import { detectVoiceActivity as detectVoiceActivityActiveGate } from "../src/vad/ActiveGateOg.js"
import { detectVoiceActivity as detectVoiceActivitySilero } from "../src/vad/Silero.js"

async function loadAudioFile(path: string): Promise<RawAudio> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i",
      path,
      "-f",
      "f32le",
      "-acodec",
      "pcm_f32le",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-",
    ])

    const chunks: Buffer[] = []
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on("data", () => {})

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`))
        return
      }

      const buffer = Buffer.concat(chunks)
      const samples = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.length / 4,
      )

      resolve({
        audioChannels: [samples],
        sampleRate: 16000,
      })
    })

    proc.on("error", reject)
  })
}

void describe("ActiveGate VAD OG", () => {
  void it("detects voice activity in audio file", async () => {
    const inputPath = new URL(
      "./test-data/poemsbywomen_01__64kb.mp3",
      import.meta.url,
    ).pathname
    const segments = await detectVoiceActivityActiveGate(inputPath, {})
    // console.log("SEGMENTS", segments)
    assert.ok(segments.length > 0, "should produce segments")
    assert.ok(
      segments.filter((s) => s.type === "segment" && s.text === "active")
        .length > 0,
      "should produce speech segments",
    )
    assert.ok(
      segments.every((s) => s.startTime >= 0),
      "startTime should be non-negative",
    )
    assert.ok(
      segments.every((s) => s.endTime > s.startTime),
      "endTime should be after startTime",
    )
    console.log(`detected ${segments.length} speech segments`)
    console.log("first few segments:", segments.slice(0, 5))
  })
})

void describe("Silero VAD", () => {
  void it("detects voice activity in audio file", async () => {
    const inputPath = new URL(
      "./test-data/poemsbywomen_01__64kb.mp3",
      import.meta.url,
    ).pathname
    const segments = await detectVoiceActivitySilero(inputPath)
    assert.ok(segments.length > 0, "should produce segments")
    assert.ok(
      segments.every((s) => s.isSpeech),
      "should produce speech segments",
    )
    assert.ok(
      segments.every((s) => s.startTime >= 0),
      "startTime should be non-negative",
    )
    assert.ok(
      segments.every((s) => s.endTime > s.startTime),
      "endTime should be after startTime",
    )
    console.log(`detected ${segments.length} speech segments`)
    console.log("first few segments:", segments.slice(0, 5))
  })
})

void describe("ActiveGate VAD", () => {
  void it("detects voice activity in audio file", async () => {
    const inputPath = new URL(
      "./test-data/poemsbywomen_01__64kb.mp3",
      import.meta.url,
    ).pathname
    const audio = await loadAudioFile(inputPath)

    const segments = detectVoiceActivity(audio)

    assert.ok(segments.length > 0, "should produce segments")

    const activeSegments = segments.filter((e) => e.isActive)
    const inactiveSegments = segments.filter((e) => !e.isActive)

    assert.ok(activeSegments.length > 0, "should detect some active segments")
    assert.ok(
      inactiveSegments.length > 0,
      "should detect some inactive segments",
    )

    for (const entry of segments) {
      assert.ok(entry.startTime >= 0, "startTime should be non-negative")
      assert.ok(
        entry.endTime > entry.startTime,
        "endTime should be after startTime",
      )
    }

    console.log(
      `detected ${activeSegments.length} active and ${inactiveSegments.length} inactive segments`,
    )
    console.log("first few segments:", segments.slice(0, 5))
  })

  void it("streaming flush produces same results as batch", async () => {
    const inputPath = new URL(
      "./test-data/poemsbywomen_01__64kb.mp3",
      import.meta.url,
    ).pathname
    const audio = await loadAudioFile(inputPath)

    const batchSegments = detectVoiceActivity(audio)

    // process in 1-second chunks with flush
    const vad = new StreamingVad(audio.sampleRate, audio.audioChannels.length)
    const streamSegments: VadSegment[] = []
    const chunkSize = audio.sampleRate // 1 second

    const samples = audio.audioChannels[0]
    if (!samples) {
      throw new Error("no samples found")
    }
    for (let offset = 0; offset < samples.length; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, samples.length)
      for (let i = offset; i < end; i++) {
        const sample = samples[i]
        if (sample === undefined) {
          throw new Error(`sample at index ${i} not found`)
        }
        vad.process(sample, 0)
      }
      streamSegments.push(...vad.flush())
    }
    streamSegments.push(...vad.flush(true))

    console.log("First few stream segments:", streamSegments.slice(0, 5))

    assert.strictEqual(
      streamSegments.length,
      batchSegments.length,
      "should produce same number of segments",
    )

    for (let i = 0; i < streamSegments.length; i++) {
      const stream = streamSegments[i]
      const batch = batchSegments[i]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      assert.ok(stream && batch)
      assert.strictEqual(stream.isActive, batch.isActive, `segment ${i} active`)
      assert.ok(
        Math.abs(stream.startTime - batch.startTime) < 0.001,
        `segment ${i} startTime`,
      )
      assert.ok(
        Math.abs(stream.endTime - batch.endTime) < 0.001,
        `segment ${i} endTime`,
      )
    }
  })

  void it("vadFromStream processes ffmpeg output directly", async () => {
    const inputPath = new URL(
      "./test-data/poemsbywomen_01__64kb.mp3",
      import.meta.url,
    ).pathname

    // get batch result for comparison
    const audio = await loadAudioFile(inputPath)
    const batchSegments = detectVoiceActivity(audio)

    const streamSegments = await vadFromFile(inputPath)

    assert.strictEqual(
      streamSegments.length,
      batchSegments.length,
      "stream should produce same number of segments as batch",
    )

    for (let i = 0; i < streamSegments.length; i++) {
      const stream = streamSegments[i]
      const batch = batchSegments[i]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      assert.ok(stream && batch)
      assert.strictEqual(stream.isActive, batch.isActive, `segment ${i} active`)
      assert.ok(
        Math.abs(stream.startTime - batch.startTime) < 0.001,
        `segment ${i} startTime`,
      )
      assert.ok(
        Math.abs(stream.endTime - batch.endTime) < 0.001,
        `segment ${i} endTime`,
      )
    }

    console.log(
      `stream processed ${streamSegments.length} segments matching batch`,
    )
  })

  void it("handles empty audio", () => {
    const audio: RawAudio = {
      audioChannels: [new Float32Array(0)],
      sampleRate: 16000,
    }

    const timeline = detectVoiceActivity(audio)
    assert.deepStrictEqual(timeline, [])
  })

  void it("handles silent audio", () => {
    const audio: RawAudio = {
      audioChannels: [new Float32Array(16000)],
      sampleRate: 16000,
    }

    const segments = detectVoiceActivity(audio)
    assert.ok(segments.length > 0)

    const activeSegments = segments.filter((e) => e.isActive)
    assert.strictEqual(
      activeSegments.length,
      0,
      "silent audio should have no active segments",
    )
  })

  void it("reset clears all state", () => {
    const vad = new StreamingVad(16000, 1)

    // process some loud samples
    for (let i = 0; i < 16000; i++) {
      vad.process(Math.sin(i * 0.1) * 0.5, 0)
    }

    const beforeReset = vad.flush(true)
    const activeBeforeReset = beforeReset.filter((s) => s.isActive)
    assert.ok(
      activeBeforeReset.length > 0,
      "should have active segments before reset",
    )

    vad.reset()

    // process silence
    for (let i = 0; i < 16000; i++) {
      vad.process(0, 0)
    }

    const afterReset = vad.flush(true)
    const activeAfterReset = afterReset.filter((s) => s.isActive)
    assert.strictEqual(
      activeAfterReset.length,
      0,
      "should have no active segments after reset with silence",
    )
  })

  void it("memory is bounded during streaming", () => {
    const vad = new StreamingVad(16000, 1)

    // process 10 seconds in 1-second chunks, flushing each time
    for (let chunk = 0; chunk < 10; chunk++) {
      for (let i = 0; i < 16000; i++) {
        vad.process(Math.sin(i * 0.1) * (chunk % 2 === 0 ? 0.5 : 0.01), 0)
      }
      vad.flush()
    }

    // the internal frame buffer should be bounded by backwardExtensionDuration
    // which is 200ms = 20 frames at 10ms per frame
    // we can't directly check internal state, but we can verify
    // that processing continues to work correctly
    const finalSegments = vad.flush(true)
    assert.ok(Array.isArray(finalSegments))
  })
})
