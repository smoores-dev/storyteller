import assert from "node:assert"
import { execFile } from "node:child_process"
import { createReadStream } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { type AddressInfo } from "node:net"
import { join } from "node:path"
import { promisify } from "node:util"

import { type ServerType } from "@hono/node-server"
import OpenAI from "openai"
import { afterAll, beforeAll, describe, it } from "vitest"

import { Scratch, createTiming } from "../src/index.ts"
import { type WhisperCppOptions } from "../src/recognition/WhisperCppSTT.ts"
import { recognize as recognizeWhisperServer } from "../src/recognition/WhisperServerSTT.ts"
import {
  type VerboseTranscription,
  createServer,
  diskFileStore,
  listen,
  transcriptionService,
} from "../src/server/index.ts"

const API_KEY = "secret"

const AUTH = { Authorization: `Bearer ${API_KEY}` }

const WORDS = [
  { text: "Call", startTime: 0.1, endTime: 0.4, confidence: 0.9 },
  { text: "me", startTime: 0.4, endTime: 0.6, confidence: 0.8 },
  { text: "Ishmael.", startTime: 0.6, endTime: 1.2, confidence: 0.95 },
  { text: "Some", startTime: 3, endTime: 3.3, confidence: 0.7 },
  { text: "years", startTime: 3.3, endTime: 3.8, confidence: 0.9 },
].map((word) => ({ type: "word" as const, ...word }))

describe("transcription server", () => {
  const calls: WhisperCppOptions[] = []
  let scratch: Scratch
  let audio: string
  let app: ReturnType<typeof createServer>
  let server: ServerType
  let url: string
  let words = WORDS

  const noise = async (seconds: number) => {
    const path = scratch.unique(".wav")
    await promisify(execFile)("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `anoisesrc=d=${seconds}:r=16000:seed=1`,
      "-ac",
      "1",
      path,
    ])
    return path
  }

  const transcribe = (fields: Record<string, string | string[]>) => {
    const form = new FormData()
    return readFile(audio).then((bytes) => {
      form.append("file", new Blob([bytes]), "chapter.wav")
      for (const [key, value] of Object.entries(fields)) {
        for (const item of [value].flat()) {
          form.append(key, item)
        }
      }
      return app.request("/v1/audio/transcriptions", {
        method: "POST",
        body: form,
        headers: AUTH,
      })
    })
  }

  beforeAll(async () => {
    scratch = await Scratch.create({ sweep: false })
    audio = await noise(4)
    await writeFile(join(scratch.path, "ggml-tiny.en.bin"), "")
    await writeFile(join(scratch.path, "ggml-base.en.bin"), "")
    const files = await diskFileStore()
    app = createServer({
      services: [
        transcriptionService({
          model: "base.en",
          modelDir: scratch.path,
          recognize: (_input, _timing, options) => {
            calls.push(options)
            return Promise.resolve({
              transcript: "Call me Ishmael. Some years",
              timeline: words,
              language: "en",
            })
          },
        }),
      ],
      files,
      apiKey: API_KEY,
    })
    server = await listen(app, { host: "127.0.0.1", port: 0 })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    server.close()
    await scratch[Symbol.asyncDispose]()
  })

  it("responds with the text by default", async () => {
    const response = await transcribe({ model: "whisper-1" })
    assert.strictEqual(response.status, 200)
    assert.deepStrictEqual(await response.json(), {
      text: "Call me Ishmael. Some years",
    })
    assert.strictEqual(calls.at(-1)?.model, "base.en")
  })

  it("responds with verbose_json with words and segments", async () => {
    const response = await transcribe({
      model: "tiny.en",
      language: "EN",
      response_format: "verbose_json",
      "timestamp_granularities[]": ["word", "segment"],
    })
    const body = (await response.json()) as VerboseTranscription
    assert.strictEqual(calls.at(-1)?.model, "tiny.en")
    assert.strictEqual(calls.at(-1)?.language, "en")
    assert.strictEqual(body.language, "en")
    assert.ok(Math.abs(body.duration - 4) < 0.01)
    assert.deepStrictEqual(body.words?.[2], {
      word: "Ishmael.",
      start: 0.6,
      end: 1.2,
      probability: 0.95,
    })
    assert.deepStrictEqual(
      body.segments?.map(({ words, ...segment }) => ({
        ...segment,
        words: words.map((word) => word.word),
      })),
      [
        {
          id: 0,
          start: 0.1,
          end: 1.2,
          text: "Call me Ishmael.",
          words: [" Call", " me", " Ishmael."],
        },
        {
          id: 1,
          start: 3,
          end: 3.8,
          text: "Some years",
          words: [" Some", " years"],
        },
      ],
    )
  })

  it("leaves out word timestamps unless asked for", async () => {
    const response = await transcribe({ response_format: "verbose_json" })
    const body = (await response.json()) as VerboseTranscription
    assert.strictEqual(body.words, undefined)
    assert.strictEqual(body.segments?.length, 2)
  })

  it("responds with text, srt and vtt as plain text", async () => {
    const text = await transcribe({ response_format: "text" })
    assert.strictEqual(await text.text(), "Call me Ishmael. Some years")

    const srt = await transcribe({ response_format: "srt" })
    assert.strictEqual(
      await srt.text(),
      "1\n00:00:00,100 --> 00:00:01,200\nCall me Ishmael.\n\n2\n00:00:03,000 --> 00:00:03,800\nSome years\n",
    )

    const vtt = await transcribe({ response_format: "vtt" })
    assert.strictEqual(
      await vtt.text(),
      "WEBVTT\n\n00:00:00.100 --> 00:00:01.200\nCall me Ishmael.\n\n00:00:03.000 --> 00:00:03.800\nSome years\n",
    )
  })

  it("responds with 400 if a model or language the server does not have", async () => {
    const model = await transcribe({ model: "large-v3" })
    assert.strictEqual(model.status, 400)
    assert.match(
      ((await model.json()) as { error: string }).error,
      /install model large-v3/,
    )

    const language = await transcribe({ language: "xx" })
    assert.strictEqual(language.status, 400)

    const format = await transcribe({ response_format: "mp3" })
    assert.strictEqual(format.status, 400)
  })

  it("responds with 400 if no file is supplied", async () => {
    const response = await app.request("/v1/audio/transcriptions", {
      method: "POST",
      body: new FormData(),
      headers: AUTH,
    })
    assert.strictEqual(response.status, 400)
  })

  it("lists the installed whisper models, default first", async () => {
    const response = await app.request("/v1/models", { headers: AUTH })
    const { data } = (await response.json()) as { data: { id: string }[] }
    assert.deepStrictEqual(
      data.map((model) => model.id),
      ["base.en", "tiny.en"],
    )
  })

  it("works with Storyteller's whisper-server engine, which leaves the timestamps alone", async () => {
    words = WORDS.map((word, index) =>
      index < 3
        ? word
        : {
            ...word,
            startTime: word.startTime + 35,
            endTime: word.endTime + 35,
          },
    )
    try {
      const { transcript, timeline } = await recognizeWhisperServer(
        await noise(150),
        "en",
        createTiming(),
        { baseURL: `${url}/v1`, apiKey: API_KEY },
      )
      assert.strictEqual(transcript, "Call me Ishmael. Some years")
      assert.deepStrictEqual(
        timeline?.map(({ text, startTime, endTime }) => ({
          text,
          startTime,
          endTime,
        })),
        words.map(({ text, startTime, endTime }) => ({
          text,
          startTime,
          endTime,
        })),
      )
    } finally {
      words = WORDS
    }
  })

  it("works with the OpenAI SDK", async () => {
    const client = new OpenAI({ apiKey: API_KEY, baseURL: `${url}/v1` })
    const transcription = await client.audio.transcriptions.create({
      file: createReadStream(audio),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    })
    assert.strictEqual(transcription.words?.length, WORDS.length)

    const models = await client.models.list()
    assert.ok(models.data.some((model) => model.id === "base.en"))
  })
})
