/* eslint-disable no-console */
import { spawn } from "node:child_process"
import { performance } from "node:perf_hooks"

import {
  type RawAudio,
  StreamingVad,
  detectVoiceActivity as detectVoiceActivityActiveGate,
  vadFromFile,
} from "../src/vad/ActiveGate.js"
import { detectVoiceActivity as detectVoiceActivityActiveGateOg } from "../src/vad/ActiveGateOg.js"
import { detectVoiceActivity as detectVoiceActivitySilero } from "../src/vad/Silero.js"

// test files
const SMALL_FILE = new URL(
  "./test-data/poemsbywomen_01__64kb.mp3",
  import.meta.url,
).pathname

const LARGE_FILE = new URL(
  "../../web/src/__fixtures__/mp3/MobyDickOrTheWhalePart1_librivox.mp3",
  import.meta.url,
).pathname

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(2)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

// note: heapUsed only measures node.js heap, not memory used by child processes (ffmpeg)
// or temp files on disk. this is why ActiveGateOg shows lower heap usage despite
// creating temp files - the wav file lives on disk and ffmpeg runs in a separate process.
function getMemoryUsage(): { heap: number; rss: number } {
  const mem = process.memoryUsage()
  return { heap: mem.heapUsed, rss: mem.rss }
}

async function forceGc() {
  if (!global.gc) {
    throw new Error(
      "global.gc is not available. Please run the benchmark with the --expose-gc flag.",
    )
  }

  global.gc()
  await new Promise((r) => setTimeout(r, 100))
}

interface BenchResult {
  name: string
  file: string
  duration: number
  heapBefore: number
  heapPeak: number
  rssBefore: number
  rssPeak: number
  segmentCount: number
}

function printResult(r: BenchResult) {
  const heapDelta = r.heapPeak - r.heapBefore
  const rssDelta = r.rssPeak - r.rssBefore
  console.log(
    `  -> ${r.name}: ${formatMs(r.duration)}, heap: +${formatBytes(heapDelta)}, rss: +${formatBytes(rssDelta)}, segments: ${r.segmentCount}`,
  )
}

async function benchmarkActiveGateOg(
  filepath: string,
  label: string,
): Promise<BenchResult> {
  await forceGc()
  const memBefore = getMemoryUsage()
  let heapPeak = memBefore.heap
  let rssPeak = memBefore.rss

  const memoryMonitor = setInterval(() => {
    const current = getMemoryUsage()
    if (current.heap > heapPeak) heapPeak = current.heap
    if (current.rss > rssPeak) rssPeak = current.rss
  }, 10)

  const start = performance.now()
  const segments = await detectVoiceActivityActiveGateOg(filepath, {})
  const duration = performance.now() - start

  clearInterval(memoryMonitor)

  const result: BenchResult = {
    name: "ActiveGateOg",
    file: label,
    duration,
    heapBefore: memBefore.heap,
    heapPeak,
    rssBefore: memBefore.rss,
    rssPeak,
    segmentCount: segments.length,
  }
  printResult(result)
  return result
}

async function benchmarkActiveGateStreaming(
  filepath: string,
  label: string,
): Promise<BenchResult> {
  await forceGc()
  const memBefore = getMemoryUsage()
  let heapPeak = memBefore.heap
  let rssPeak = memBefore.rss

  const memoryMonitor = setInterval(() => {
    const current = getMemoryUsage()
    if (current.heap > heapPeak) heapPeak = current.heap
    if (current.rss > rssPeak) rssPeak = current.rss
  }, 10)

  const start = performance.now()
  const segments = await vadFromFile(filepath)
  const duration = performance.now() - start

  clearInterval(memoryMonitor)

  const result: BenchResult = {
    name: "ActiveGate (streaming)",
    file: label,
    duration,
    heapBefore: memBefore.heap,
    heapPeak,
    rssBefore: memBefore.rss,
    rssPeak,
    segmentCount: segments.length,
  }
  printResult(result)
  return result
}

async function benchmarkActiveGateBatch(
  filepath: string,
  label: string,
): Promise<BenchResult> {
  await forceGc()
  const memBefore = getMemoryUsage()
  let heapPeak = memBefore.heap
  let rssPeak = memBefore.rss

  const memoryMonitor = setInterval(() => {
    const current = getMemoryUsage()
    if (current.heap > heapPeak) heapPeak = current.heap
    if (current.rss > rssPeak) rssPeak = current.rss
  }, 10)

  const start = performance.now()
  const audio = await loadAudioFile(filepath)
  const segments = detectVoiceActivityActiveGate(audio)
  const duration = performance.now() - start

  clearInterval(memoryMonitor)

  const result: BenchResult = {
    name: "ActiveGate (batch)",
    file: label,
    duration,
    heapBefore: memBefore.heap,
    heapPeak,
    rssBefore: memBefore.rss,
    rssPeak,
    segmentCount: segments.length,
  }
  printResult(result)
  return result
}

async function benchmarkSilero(
  filepath: string,
  label: string,
): Promise<BenchResult> {
  await forceGc()
  const memBefore = getMemoryUsage()
  let heapPeak = memBefore.heap
  let rssPeak = memBefore.rss

  const memoryMonitor = setInterval(() => {
    const current = getMemoryUsage()
    if (current.heap > heapPeak) heapPeak = current.heap
    if (current.rss > rssPeak) rssPeak = current.rss
  }, 10)

  const start = performance.now()
  const segments = await detectVoiceActivitySilero(filepath, {
    printOutput: false,
  })
  const duration = performance.now() - start

  clearInterval(memoryMonitor)

  const result: BenchResult = {
    name: "Silero",
    file: label,
    duration,
    heapBefore: memBefore.heap,
    heapPeak,
    rssBefore: memBefore.rss,
    rssPeak,
    segmentCount: segments.length,
  }
  printResult(result)
  return result
}

function printSummary(results: BenchResult[]) {
  console.log("\n" + "=".repeat(100))
  console.log("SUMMARY")
  console.log("=".repeat(100))

  const smallResults = results.filter((r) => r.file === "small")
  const largeResults = results.filter((r) => r.file === "large")

  if (smallResults.length > 0) {
    console.log("\nSmall file:")
    const fastest = smallResults.reduce((a, b) =>
      a.duration < b.duration ? a : b,
    )
    for (const r of smallResults) {
      const heapDelta = r.heapPeak - r.heapBefore
      const rssDelta = r.rssPeak - r.rssBefore
      const speedup =
        r === fastest
          ? ""
          : ` (${((r.duration / fastest.duration - 1) * 100).toFixed(0)}% slower)`
      console.log(
        `  ${r.name.padEnd(25)} ${formatMs(r.duration).padStart(10)}${speedup}`,
      )
      console.log(
        `${"".padEnd(27)} heap: +${formatBytes(heapDelta).padStart(10)}, rss: +${formatBytes(rssDelta).padStart(10)}`,
      )
    }
  }

  if (largeResults.length > 0) {
    console.log("\nLarge file:")
    const fastest = largeResults.reduce((a, b) =>
      a.duration < b.duration ? a : b,
    )
    for (const r of largeResults) {
      const heapDelta = r.heapPeak - r.heapBefore
      const rssDelta = r.rssPeak - r.rssBefore
      const speedup =
        r === fastest
          ? ""
          : ` (${((r.duration / fastest.duration - 1) * 100).toFixed(0)}% slower)`
      console.log(
        `  ${r.name.padEnd(25)} ${formatMs(r.duration).padStart(10)}${speedup}`,
      )
      console.log(
        `${"".padEnd(27)} heap: +${formatBytes(heapDelta).padStart(10)}, rss: +${formatBytes(rssDelta).padStart(10)}`,
      )
    }
  }

  console.log(
    "\nNote: heap measures Node.js heap only. ActiveGateOg's lower heap usage is because",
  )
  console.log(
    "it writes temp files to disk and runs ffmpeg in a separate process.",
  )
}

// emulates the pattern in processAudio.ts where vad is called multiple times
// on segments of a longer audio file
async function benchmarkRepeatedCalls(
  iterations: number,
): Promise<{ name: string; totalDuration: number; avgDuration: number }[]> {
  console.log(`\n${"=".repeat(100)}`)
  console.log(
    `REPEATED CALLS BENCHMARK (${iterations} iterations on small file)`,
  )
  console.log("=".repeat(100))

  const results: {
    name: string
    totalDuration: number
    avgDuration: number
  }[] = []

  // activegatereog repeated
  {
    const durations: number[] = []
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      await detectVoiceActivityActiveGateOg(SMALL_FILE, {})
      durations.push(performance.now() - start)
    }
    const total = durations.reduce((a, b) => a + b, 0)
    results.push({
      name: "ActiveGateOg",
      totalDuration: total,
      avgDuration: total / iterations,
    })
  }

  // activegate streaming repeated
  {
    const durations: number[] = []
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      await vadFromFile(SMALL_FILE)
      durations.push(performance.now() - start)
    }
    const total = durations.reduce((a, b) => a + b, 0)
    results.push({
      name: "ActiveGate (streaming)",
      totalDuration: total,
      avgDuration: total / iterations,
    })
  }

  // silero repeated
  {
    const durations: number[] = []
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      await detectVoiceActivitySilero(SMALL_FILE, { printOutput: false })
      durations.push(performance.now() - start)
    }
    const total = durations.reduce((a, b) => a + b, 0)
    results.push({
      name: "Silero",
      totalDuration: total,
      avgDuration: total / iterations,
    })
  }

  for (const r of results) {
    console.log(`\n${r.name}`)
    console.log(`  total:   ${formatMs(r.totalDuration)}`)
    console.log(`  average: ${formatMs(r.avgDuration)}`)
  }

  return results
}

// benchmark the pure sample processing without file i/o
// this isolates the algorithm performance from ffmpeg overhead
async function benchmarkPureProcessing() {
  console.log(`\n${"=".repeat(100)}`)
  console.log("PURE PROCESSING BENCHMARK (algorithm only, no file i/o)")
  console.log("=".repeat(100))

  const audio = await loadAudioFile(SMALL_FILE)
  const samples = audio.audioChannels[0]

  const iterations = 50

  // activegate batch processing
  const batchDurations: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    detectVoiceActivityActiveGate(audio)
    batchDurations.push(performance.now() - start)
  }
  const batchAvg =
    batchDurations.reduce((a, b) => a + b, 0) / batchDurations.length
  const batchMin = Math.min(...batchDurations)
  const batchMax = Math.max(...batchDurations)

  // activegate streaming with flush pattern (emulates the processAudio usage)
  const streamDurations: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const vad = new StreamingVad(audio.sampleRate, audio.audioChannels.length)
    const chunkSize = audio.sampleRate // 1 second chunks
    if (!samples) {
      throw new Error("no samples found")
    }
    for (let offset = 0; offset < samples.length; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, samples.length)
      for (let j = offset; j < end; j++) {
        const sample = samples[j]
        if (sample === undefined) {
          throw new Error(`sample at index ${j} not found`)
        }
        vad.process(sample, 0)
      }
      vad.flush()
    }
    vad.flush(true)
    streamDurations.push(performance.now() - start)
  }
  const streamAvg =
    streamDurations.reduce((a, b) => a + b, 0) / streamDurations.length
  const streamMin = Math.min(...streamDurations)
  const streamMax = Math.max(...streamDurations)

  console.log(`\n${iterations} iterations each:`)
  console.log(`\nActiveGate (batch)`)
  console.log(
    `  avg: ${formatMs(batchAvg)}, min: ${formatMs(batchMin)}, max: ${formatMs(batchMax)}`,
  )
  console.log(`  ops/sec: ${(1000 / batchAvg).toFixed(2)}`)

  console.log(`\nActiveGate (streaming with flush)`)
  console.log(
    `  avg: ${formatMs(streamAvg)}, min: ${formatMs(streamMin)}, max: ${formatMs(streamMax)}`,
  )
  console.log(`  ops/sec: ${(1000 / streamAvg).toFixed(2)}`)

  const diff = ((streamAvg - batchAvg) / batchAvg) * 100
  console.log(
    `\nstreaming is ${diff > 0 ? "slower" : "faster"} by ${Math.abs(diff).toFixed(1)}%`,
  )
}

// efficiency observations gathered during analysis
function printEfficiencyNotes() {
  console.log(`\n${"=".repeat(100)}`)
  console.log("EFFICIENCY OBSERVATIONS")
  console.log("=".repeat(100))

  const notes = [
    "1. ActiveGateOg creates a temp .wav file via fileToWav, then reads it entirely into memory",
    "   - this causes two full audio loads: once into wav, once into Float32Array",
    "   - the temp file is not cleaned up automatically",
    "",
    "2. ActiveGate (streaming) uses ffmpeg-stream to process audio incrementally",
    "   - avoids loading the entire audio into memory at once",
    "   - but still buffers frames for backward extension (bounded by backwardExtensionDuration)",
    "",
    "3. Both ActiveGate variants process sample-by-sample through biquad filters",
    "   - this is inherently sequential and cannot be parallelized easily",
    "   - could potentially be optimized with SIMD or block processing",
    "",
    "4. Silero uses an external whisper.cpp process with neural network",
    "   - process spawn overhead is significant for small files",
    "   - but may be faster for large files due to optimized native code",
    "",
    "5. The DecayingPeakEstimator in both ActiveGate versions updates per-sample",
    "   - ticksPerSecond = sampleRate * channelCount, so decay calculation happens ~16000 times/sec",
    "   - the decay could potentially be batched",
    "",
    "6. processAudio.ts calls detectVoiceActivity repeatedly on 2-minute segments",
    "   - each call spawns ffmpeg and processes from scratch",
    "   - a persistent vad instance could be more efficient",
  ]

  for (const note of notes) {
    console.log(note)
  }
}

async function main() {
  console.log("VAD BENCHMARK")
  console.log(`small file: ${SMALL_FILE}`)
  console.log(`large file: ${LARGE_FILE}`)

  const allResults: BenchResult[] = []

  // benchmark on small file
  console.log(`\n${"=".repeat(100)}`)
  console.log("SMALL FILE BENCHMARK")
  console.log("=".repeat(100))

  allResults.push(await benchmarkActiveGateStreaming(SMALL_FILE, "small"))
  allResults.push(await benchmarkActiveGateBatch(SMALL_FILE, "small"))
  allResults.push(await benchmarkActiveGateOg(SMALL_FILE, "small"))
  try {
    allResults.push(await benchmarkSilero(SMALL_FILE, "small"))
  } catch (e) {
    console.log(`\nSilero [small]: SKIPPED (${(e as Error).message})`)
  }

  // benchmark on large file
  console.log(`\n${"=".repeat(100)}`)
  console.log("LARGE FILE BENCHMARK")
  console.log("=".repeat(100))

  allResults.push(await benchmarkActiveGateStreaming(LARGE_FILE, "large"))
  allResults.push(await benchmarkActiveGateBatch(LARGE_FILE, "large"))
  allResults.push(await benchmarkActiveGateOg(LARGE_FILE, "large"))
  try {
    allResults.push(await benchmarkSilero(LARGE_FILE, "large"))
  } catch (e) {
    console.log(`\nSilero [large]: SKIPPED (${(e as Error).message})`)
  }

  printSummary(allResults)

  await benchmarkRepeatedCalls(5)
  await benchmarkPureProcessing()
  printEfficiencyNotes()
}

main().catch(console.error)
