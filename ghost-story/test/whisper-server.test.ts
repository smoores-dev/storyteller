/* eslint-disable no-console */
import assert from "node:assert"
import type { ChildProcess } from "node:child_process"
import { after, before, describe, it } from "node:test"
import { setTimeout } from "node:timers/promises"

import { spawnWhisperServer } from "../src/cli/whisper-server.js"
import { recognize } from "../src/recognition/WhisperServerSTT.js"
import { createTiming } from "../src/utilities/Timing.ts"

// just a helper function to fetch a URL with retries and a timeout
async function tryFetch(
  url: string,
  maxRetries: number = 3,
  timeout: number = 3000,
): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })

    if (res.ok) {
      console.log("Fetch successful")
      return await res.text()
    }

    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  } catch (error: unknown) {
    console.log("Fetch failed", error)
    if (maxRetries > 0) {
      await setTimeout(timeout)
      return tryFetch(url, maxRetries - 1, timeout)
    }

    throw error
  }
}

let server: ChildProcess | undefined
before(async () => {
  server = await spawnWhisperServer({
    model: "tiny.en",
    port: 8081,
    host: "0.0.0.0",

    threads: 4,
    processors: 1,
    convert: true,
    autoInstall: true,
    force: true,
  })

  await Promise.race([tryFetch("http://0.0.0.0:8081"), setTimeout(10_000)])
})

after(() => {
  if (server) {
    server.kill()
  }
})

void describe("whisper-server", () => {
  void it("should have started the server", { timeout: 120_000 }, async () => {
    assert.ok(server !== undefined)
    const res = await fetch("http://localhost:8081")
    assert.ok(res.ok)
    const data = await res.text()
    assert.ok(!!data, "Did not get any data from the server")
    console.log("Server data:", data)
    assert.ok(
      data.includes("<title>Whisper.cpp Server</title>"),
      "Did not get the expected data from the server",
    )
  })

  void it(
    "should transcribe using local whisper server",
    { timeout: 120_000 },
    async () => {
      const audioPath = new URL(
        "./test-data/poemsbywomen_01__64kb.mp3",
        import.meta.url,
      )

      const timing = createTiming()
      const result = await recognize(audioPath.pathname, "en", timing, {
        baseURL: "http://0.0.0.0:8081",
      })

      assert.ok(!!result)
      assert.ok(!!result.transcript)
      assert.ok(result.transcript.length > 0)

      console.log("Transcript:", result.transcript.substring(0, 200) + "...")
      console.log("Timeline entries:", result.timeline?.length ?? 0)
    },
  )
})
