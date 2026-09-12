// oxlint-disable no-console no-empty

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { performance } from "node:perf_hooks"

import { compute, loadModel } from "../src/index.ts"

const [modelDir, audioPath] = process.argv.slice(2)
if (!modelDir || !audioPath) {
  console.error(
    "usage: node scripts/citrinet-check.mjs <model-dir> <audio-file>",
  )
  process.exit(1)
}

const seconds = 25
const decoded = spawnSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-t",
    String(seconds),
    "-i",
    audioPath,
    "-f",
    "f32le",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-",
  ],
  { maxBuffer: 1 << 28 },
)
if (decoded.status !== 0) throw new Error(decoded.stderr.toString())
const samples = new Float32Array(
  decoded.stdout.buffer,
  decoded.stdout.byteOffset,
  decoded.stdout.byteLength / 4,
).slice(0, 16000 * seconds)

function readSafetensors(path) {
  const file = readFileSync(path)
  const headerLength = Number(file.readBigUInt64LE(0))
  const header = JSON.parse(file.subarray(8, 8 + headerLength).toString("utf8"))
  const tensors = {}
  for (const [
    name,
    {
      shape,
      data_offsets: [start, end],
    },
  ] of Object.entries(header)) {
    if (name === "__metadata__") continue
    const bytes = file.subarray(
      8 + headerLength + start,
      8 + headerLength + end,
    )
    tensors[name] = {
      shape,
      values: new Float32Array(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      ),
    }
  }
  return tensors
}

const model = await loadModel(modelDir)
console.log(
  "vocab size",
  model.vocab.size,
  "samplesPerFrame",
  model.samplesPerFrame,
  "minSamples",
  model.minSamples,
  "blank",
  model.blankId,
  "tokenizer",
  model.tokenizer,
  "frameOffsetSeconds",
  model.frameOffsetSeconds,
)

const first = await compute(model, samples)
console.log("frames", first.frames, "classes", first.classes)

const inverse = new Map(
  [...model.vocab].map(([token, index]) => [index, token]),
)
let text = ""
let last = -1
for (let frame = 0; frame < first.frames; frame++) {
  const row = first.values.subarray(
    frame * first.classes,
    (frame + 1) * first.classes,
  )
  let best = 0
  for (let i = 1; i < row.length; i++) if (row[i] > row[best]) best = i
  if (best !== last && best !== model.blankId)
    text += inverse.get(best).replaceAll("\u2581", " ")
  last = best
}
console.log(text.slice(0, 200))

let reference
try {
  reference = readSafetensors(join(modelDir, "reference.safetensors"))
} catch {}
if (reference?.logprobs) {
  const { shape, values } = reference.logprobs
  let maxDiff = 0
  let agree = 0
  for (let frame = 0; frame < shape[0]; frame++) {
    let bestOut = 0
    let bestRef = 0
    for (let c = 0; c < shape[1]; c++) {
      const ref = values[frame * shape[1] + c]
      const out = first.values[frame * first.classes + c]
      maxDiff = Math.max(maxDiff, Math.abs(out - ref))
      if (out > first.values[frame * first.classes + bestOut]) bestOut = c
      if (ref > values[frame * shape[1] + bestRef]) bestRef = c
    }
    if (bestOut === bestRef) agree++
  }
  console.log(
    "max abs diff",
    maxDiff.toFixed(4),
    "argmax agreement",
    (agree / shape[0]).toFixed(4),
  )
}

const rounds = 10
const start = performance.now()
for (let i = 0; i < rounds; i++) await compute(model, samples)
const perChunk = (performance.now() - start) / rounds
console.log(
  `${perChunk.toFixed(1)} ms per ${seconds} s chunk, ${((seconds * 1000) / perChunk).toFixed(0)}x realtime`,
)
await model[Symbol.asyncDispose]()
