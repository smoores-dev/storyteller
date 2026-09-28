import assert from "node:assert"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { type AddressInfo } from "node:net"
import { promisify } from "node:util"

import { type ServerType } from "@hono/node-server"
import { Hono } from "hono"
import { afterAll, beforeAll, describe, it } from "vitest"
import { z } from "zod/v4"

import {
  type CtcRun,
  type LoadedCtcModel,
  Scratch,
  decodeEmissionsHeader,
  emitRemote,
  fetchEmissionCapabilities,
  resolveRemoteCtcRun,
  uploadFile,
} from "../src/index.ts"
import {
  type FileStore,
  type Job,
  type Jobs,
  type RemoteEmissionResult,
  createServer,
  diskFileStore,
  emissionService,
  listen,
  memoryJobs,
  serviceRoutes,
} from "../src/server/index.ts"

const API_KEY = "secret"

const AUTH = { Authorization: `Bearer ${API_KEY}` }

const JSON_AUTH = { ...AUTH, "Content-Type": "application/json" }

const SAMPLES_PER_FRAME = 320

function stubModel(run: CtcRun, disposed: string[]): LoadedCtcModel {
  const vocab = new Map([
    ["<blank>", 0],
    ["a", 1],
    ["b", 2],
  ])
  return {
    run,
    vocab,
    dtype: run.dtype,
    samplesPerFrame: SAMPLES_PER_FRAME,
    minSamples: SAMPLES_PER_FRAME,
    blankId: 0,
    blankIndex: 0,
    startOffsetSeconds: run.startOffsetSeconds,
    endOffsetSeconds: run.endOffsetSeconds,
    tokenizer: null,
    compute: (chunks) =>
      Promise.resolve(
        chunks.map((chunk) => {
          const frames = Math.floor(chunk.length / SAMPLES_PER_FRAME)
          const values = new Float32Array(frames * vocab.size)
          for (let f = 0; f < frames; f++) {
            for (let k = 0; k < vocab.size; k++) {
              values[f * vocab.size + k] = chunk[f * SAMPLES_PER_FRAME + k] ?? 0
            }
          }
          return { values, frames, classes: vocab.size }
        }),
      ),
    [Symbol.asyncDispose]: () => {
      disposed.push(run.variant)
      return Promise.resolve()
    },
  }
}

async function readAll(body: AsyncIterable<unknown>): Promise<Uint8Array> {
  const parts: Buffer[] = []
  for await (const part of body) {
    parts.push(part as Buffer)
  }
  return new Uint8Array(Buffer.concat(parts))
}

async function frameBytes(bytes: Uint8Array) {
  const header = await decodeEmissionsHeader((from, to) =>
    Promise.resolve(bytes.subarray(from, to)),
  )
  return {
    header,
    frames: bytes.subarray(
      header.framesOffset,
      header.framesOffset + header.numFrames * header.bytesPerFrame,
    ),
  }
}

describe("emission server", () => {
  const loads: string[] = []
  const disposed: string[] = []
  let scratch: Scratch
  let audio: string
  let jobs: Jobs
  let files: FileStore
  let service: ReturnType<typeof emissionService>
  let app: ReturnType<typeof createServer>
  let server: ServerType
  let url: string

  beforeAll(async () => {
    scratch = await Scratch.create({ sweep: false })
    audio = scratch.unique(".wav")
    await promisify(execFile)("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "anoisesrc=d=960:c=pink:r=16000:seed=1",
      "-ac",
      "1",
      audio,
    ])
    jobs = memoryJobs()
    files = await diskFileStore()
    service = emissionService({
      jobs,
      files,
      device: "cpu",
      load: (run) => {
        loads.push(run.variant)
        return Promise.resolve(stubModel(run, disposed))
      },
    })
    app = createServer({ services: [service], files, apiKey: API_KEY })
    server = await listen(app, { host: "127.0.0.1", port: 0 })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    server.close()
    await jobs[Symbol.asyncDispose]()
    await service[Symbol.asyncDispose]()
    await files[Symbol.asyncDispose]()
    await scratch[Symbol.asyncDispose]()
  })

  it("rejects requests without the api key", async () => {
    const response = await app.request("/v1/capabilities")
    assert.strictEqual(response.status, 401)
    await assert.rejects(
      fetchEmissionCapabilities({ url, apiKey: "wrong" }),
      /rejected the API key/,
    )
    await assert.rejects(fetchEmissionCapabilities({ url }), /needs an API key/)
  })

  it("reports its capabilities", async () => {
    const capabilities = await fetchEmissionCapabilities({
      url,
      apiKey: API_KEY,
    })
    assert.strictEqual(capabilities.device, "cpu")
  })

  it("lists the model families with their languages", async () => {
    const response = await app.request("/v1/models", { headers: AUTH })
    const { data } = (await response.json()) as {
      data: { id: string; service: string; languages?: string[] }[]
    }
    const quartznet = data.find((model) => model.id === "quartznet15x5")
    assert.strictEqual(quartznet?.service, "emissions")
    assert.ok(quartznet.languages?.includes("en"))
  })

  it("resolves the run a job would get", async () => {
    const run = await resolveRemoteCtcRun(
      { url, apiKey: API_KEY },
      { model: "quartznet15x5", language: "en" },
    )
    assert.strictEqual(run.variant, "quartznet15x5_en")
    assert.strictEqual(run.device, "cpu")
    assert.strictEqual(run.dtype, "fp32")
    assert.strictEqual(run.chunkSeconds, 38)
    assert.strictEqual(run.batchSize, 1)
  })

  it("responds with 400 if a language the family has no model for", async () => {
    await assert.rejects(
      resolveRemoteCtcRun(
        { url, apiKey: API_KEY },
        { model: "quartznet15x5", language: "xx" },
      ),
      /400.*no xx model/,
    )
  })

  it("responds with 400 if a malformed query", async () => {
    await assert.rejects(
      resolveRemoteCtcRun(
        { url, apiKey: API_KEY },
        { model: "mms", dtype: "fp8" as "fp16" },
      ),
      /400.*dtype/s,
    )
  })

  it("stores uploads under their hash and checks it", async () => {
    const body = new Uint8Array([1, 2, 3, 4])
    const sha256 = createHash("sha256").update(body).digest("hex")

    const missing = await app.request(`/v1/files/${sha256}`, {
      method: "HEAD",
      headers: AUTH,
    })
    assert.strictEqual(missing.status, 404)

    const wrong = await app.request(`/v1/files/${"0".repeat(64)}`, {
      method: "PUT",
      body,
      headers: AUTH,
    })
    assert.strictEqual(wrong.status, 422)

    const created = await app.request(`/v1/files/${sha256}`, {
      method: "PUT",
      body,
      headers: AUTH,
    })
    assert.strictEqual(created.status, 201)
    assert.deepStrictEqual(await created.json(), { sha256, size: 4 })

    const again = await app.request(`/v1/files/${sha256}`, {
      method: "PUT",
      body,
      headers: AUTH,
    })
    assert.strictEqual(again.status, 200)

    const known = await app.request(`/v1/files/${sha256}`, {
      method: "HEAD",
      headers: AUTH,
    })
    assert.strictEqual(known.status, 200)
    assert.strictEqual(known.headers.get("Content-Length"), "4")

    const download = await app.request(`/v1/files/${sha256}`, {
      headers: AUTH,
    })
    assert.deepStrictEqual(new Uint8Array(await download.arrayBuffer()), body)
  })

  it("responds with 422 if a file that is not audio", async () => {
    const body = new Uint8Array([1, 2, 3, 4])
    const sha256 = createHash("sha256").update(body).digest("hex")
    for (const path of ["/v1/emissions", "/v1/emissions/jobs"]) {
      const response = await app.request(path, {
        method: "POST",
        body: JSON.stringify({ file: sha256, model: "mms" }),
        headers: JSON_AUTH,
      })
      assert.strictEqual(response.status, 422)
    }
  })

  it("responds with 404 if a file it does not have", async () => {
    for (const path of ["/v1/emissions", "/v1/emissions/jobs"]) {
      const response = await app.request(path, {
        method: "POST",
        body: JSON.stringify({ file: "f".repeat(64), model: "mms" }),
        headers: JSON_AUTH,
      })
      assert.strictEqual(response.status, 404)
    }
  })

  it("runs a job and returns an emissions file", async () => {
    const progress: number[] = []
    const emitted = await emitRemote(
      audio,
      { url, apiKey: API_KEY },
      { model: "mms" },
      {
        onProgress: (done, total) => {
          progress.push(done / total)
        },
      },
    )
    const { header } = await frameBytes(await readAll(emitted.body))

    assert.strictEqual(emitted.run.variant, "fp32")
    assert.deepStrictEqual(emitted.range, { start: 0, end: 960 })
    assert.strictEqual(header.classes, 3)
    assert.strictEqual(header.numFrames, (960 * 16000) / SAMPLES_PER_FRAME)
    assert.strictEqual(header.secondsPerFrame, SAMPLES_PER_FRAME / 16000)
    assert.strictEqual(progress.at(-1), 1)
  })

  it("returns the same result synchronously", async () => {
    const file = await uploadFile(audio, { url, apiKey: API_KEY })
    const input = JSON.stringify({
      file,
      model: "quartznet15x5",
      language: "en",
    })

    const response = await app.request("/v1/emissions", {
      method: "POST",
      body: input,
      headers: JSON_AUTH,
    })
    assert.strictEqual(response.status, 200)
    const result = (await response.json()) as RemoteEmissionResult

    const created = await app.request("/v1/emissions/jobs", {
      method: "POST",
      body: input,
      headers: JSON_AUTH,
    })
    let job = (await created.json()) as Job<RemoteEmissionResult>
    while (job.state !== "done") {
      const polled = await app.request(
        `/v1/emissions/jobs/${job.id}?wait=25&revision=${job.revision}`,
        { headers: AUTH },
      )
      job = (await polled.json()) as Job<RemoteEmissionResult>
      assert.ok(job.state !== "failed", job.error ?? "")
    }

    assert.strictEqual(result.run.variant, "quartznet15x5_en")
    assert.deepStrictEqual(job.result?.emissions, result.emissions)
    const download = await app.request(`/v1/files/${result.emissions.sha256}`, {
      headers: AUTH,
    })
    const { header } = await frameBytes(
      new Uint8Array(await download.arrayBuffer()),
    )
    assert.strictEqual(header.classes, 3)
  })

  it("joins the emissions of consecutive ranges into those of the whole file", async () => {
    const target = { url, apiKey: API_KEY }
    const options = { model: "quartznet15x5" as const, language: "en" }
    const { chunkSeconds } = await resolveRemoteCtcRun(target, options)

    const whole = await emitRemote(audio, target, options)
    const { frames: expected } = await frameBytes(await readAll(whole.body))

    const parts: Uint8Array[] = []
    for (const range of [
      { start: 0, end: chunkSeconds },
      { start: chunkSeconds, end: 10 * chunkSeconds },
      { start: 10 * chunkSeconds },
    ]) {
      const emitted = await emitRemote(audio, target, options, { range })
      parts.push((await frameBytes(await readAll(emitted.body))).frames)
    }

    assert.strictEqual(
      parts[0]?.byteLength,
      (expected.byteLength * chunkSeconds) / 960,
    )
    assert.ok(Buffer.from(expected).equals(Buffer.concat(parts)))
  })

  it("responds with 400 if a range off the chunk grid", async () => {
    await assert.rejects(
      emitRemote(
        audio,
        { url, apiKey: API_KEY },
        { model: "quartznet15x5", language: "en" },
        { range: { start: 100 } },
      ),
      /400.*multiple of 38 s/,
    )
  })

  it("keeps one model loaded and disposes the one it replaces", () => {
    assert.deepStrictEqual([...new Set(loads)], ["fp32", "quartznet15x5_en"])
    assert.deepStrictEqual(disposed, ["fp32"])
  })

  it("cancels and forgets a job on delete", async () => {
    const file = await uploadFile(audio, { url, apiKey: API_KEY })
    const created = await app.request("/v1/emissions/jobs", {
      method: "POST",
      body: JSON.stringify({ file, model: "quartznet15x5", language: "en" }),
      headers: JSON_AUTH,
    })
    assert.strictEqual(created.status, 202)
    const job = (await created.json()) as Job

    const removed = await app.request(`/v1/emissions/jobs/${job.id}`, {
      method: "DELETE",
      headers: AUTH,
    })
    assert.strictEqual(removed.status, 204)

    const gone = await app.request(`/v1/emissions/jobs/${job.id}`, {
      headers: AUTH,
    })
    assert.strictEqual(gone.status, 404)
  })

  it("keeps the jobs of each service separate", async () => {
    const echo = {
      name: "echo",
      routes: new Hono().route(
        "/echo",
        serviceRoutes({
          jobs,
          type: "echo",
          tag: "Echo",
          summary: "Echo",
          description: "Echoes.",
          input: z.object({ text: z.string() }),
          result: z.object({ text: z.string() }),
          jobId: "EchoJob",
          errors: {},
          prepare: (input) => Promise.resolve(input),
          handler: (input) => Promise.resolve(input),
        }),
      ),
      capabilities: () => ({}),
      capabilitiesSchema: z.object({}),
      models: () => [],
      [Symbol.asyncDispose]: () => Promise.resolve(),
    }
    const both = createServer({
      services: [service, echo],
      files,
      apiKey: API_KEY,
    })

    const sync = await both.request("/v1/echo", {
      method: "POST",
      body: JSON.stringify({ text: "hi" }),
      headers: JSON_AUTH,
    })
    assert.deepStrictEqual(await sync.json(), { text: "hi" })

    const created = await both.request("/v1/echo/jobs", {
      method: "POST",
      body: JSON.stringify({ text: "hi" }),
      headers: JSON_AUTH,
    })
    const job = (await created.json()) as Job
    const own = await both.request(`/v1/echo/jobs/${job.id}`, {
      headers: AUTH,
    })
    assert.strictEqual(own.status, 200)
    const other = await both.request(`/v1/emissions/jobs/${job.id}`, {
      headers: AUTH,
    })
    assert.strictEqual(other.status, 404)
  })
})
