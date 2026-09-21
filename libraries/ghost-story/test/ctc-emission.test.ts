import assert from "node:assert"
import { join } from "node:path"

import { describe, it } from "vitest"

import { isModelPackageInstalled } from "../src/cli/ctc-install.ts"
import { CTC_MODEL_PACKAGES } from "../src/constants.ts"
import { emit } from "../src/index.ts"

const CLIPS = join(import.meta.dirname, "test-data", "no-space-script")

interface Sample {
  language: "zh" | "ja"
  file: string
  expect: string[]
}

const samples: Sample[] = [
  { language: "zh", file: "mandarin.mp3", expect: ["作者", "世界"] },
  {
    language: "ja",
    file: "japanese.mp3",
    expect: ["雨にも負けず", "風にも負け"],
  },
]

function greedyDecode(
  values: Float32Array,
  frames: number,
  classes: number,
  blank: number,
  vocab: Map<string, number>,
) {
  const byId = new Map([...vocab].map(([token, id]) => [id, token]))
  let previous = -1
  let text = ""
  for (let f = 0; f < frames; f++) {
    let best = 0
    let bestValue = -Infinity
    for (let c = 0; c < classes; c++) {
      const value = values[f * classes + c] ?? -Infinity
      if (value > bestValue) {
        bestValue = value
        best = c
      }
    }
    if (best !== previous && best !== blank) {
      const token = byId.get(best) ?? ""
      if (token.length === 1 && token !== "|") text += token
    }
    previous = best
  }
  return text
}

describe("quartznet emissions on native-script audio", () => {
  for (const sample of samples) {
    const variant = `quartznet15x5_${sample.language}` as const
    const installed = isModelPackageInstalled(CTC_MODEL_PACKAGES[variant])
    const run = installed ? it : it.skip

    run(
      `${sample.language}: greedy decode reads the clip in its own script`,
      async () => {
        const result = await emit(join(CLIPS, sample.file), {
          engine: "ctc-local",
          options: {
            model: "quartznet15x5",
            language: sample.language,
            device: "cpu",
            autoInstall: false,
            printOutput: false,
          },
        })
        const text = greedyDecode(
          result.emissions.values,
          result.emissions.frames,
          result.emissions.classes,
          result.blankIndex,
          result.vocab,
        )
        assert.ok(text.length > 50, `decoded only ${text.length} chars`)
        assert.ok(
          Array.from(text).every((c) => result.vocab.has(c)),
          "every decoded char is a vocab entry",
        )
        for (const phrase of sample.expect) {
          assert.ok(text.includes(phrase), `expected ${phrase} in ${text}`)
        }
      },
    )
  }
})
