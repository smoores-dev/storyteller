import assert from "node:assert"
import { describe, it } from "node:test"

import { createTiming } from "../src/index.ts"
import { recognize } from "../src/recognition/WhisperCppSTT.js"

void describe("whispercpp", () => {
  void it("should transcribe audio file", { timeout: 120_000 }, async () => {
    const audioPath = new URL(
      "./test-data/poemsbywomen_01__64kb.mp3",
      import.meta.url,
    )

    const result = await recognize(audioPath.pathname, createTiming(), {
      language: "en",
      model: "tiny.en",
      printOutput: true,
      flashAttention: false,
    })

    assert.ok(result.transcript.startsWith("The prologue by Anne"))
    assert.ok(result.timeline.length > 0)
  })
})
