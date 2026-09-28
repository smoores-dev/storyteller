import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { extname } from "node:path"

import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import PQueue from "p-queue"
import { z } from "zod/v4"

import { getAudioDuration } from "../audio/index.ts"
import { getModelPath } from "../cli/config.ts"
import { defaultServerOptions } from "../cli/whisper-server.ts"
import {
  LANGUAGES,
  type Language,
  WHISPER_MODELS,
  type WhisperModel,
} from "../constants.ts"
import { recognize as whisperRecognize } from "../recognition/WhisperCppSTT.ts"
import { Scratch } from "../utilities/Scratch.ts"
import { type TimelineEntry } from "../utilities/Timeline.ts"
import { createTiming } from "../utilities/Timing.ts"

import { error, errorResponses, openApi } from "./openapi.ts"
import {
  type Model,
  type TranscriptionCapabilities,
  type VerboseTranscription,
  transcriptionCapabilitiesSchema,
  transcriptionRequestSchema,
  transcriptionSchema,
  verboseTranscriptionSchema,
  whisperServerConfigSchema,
} from "./protocol.ts"
import { type Service } from "./server.ts"

export interface TranscriptionServiceOptions {
  model: WhisperModel
  modelDir?: string | undefined
  threads?: number | undefined
  processors?: number | undefined
  inference?: PQueue | undefined
  recognize?: typeof whisperRecognize | undefined
  log?: ((message: string) => void) | undefined
}

const SEGMENT_PAUSE_SECONDS = 1

const SEGMENT_MAX_WORDS = 30

function timestamp(seconds: number, separator: "," | ".") {
  const ms = Math.round(seconds * 1000)
  const pad = (value: number, length = 2) => String(value).padStart(length, "0")
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${separator}${pad(ms % 1000, 3)}`
}

export function transcriptionService(
  options: TranscriptionServiceOptions,
): Service<TranscriptionCapabilities> {
  const log = options.log ?? (() => {})
  const recognize = options.recognize ?? whisperRecognize
  const inference = options.inference ?? new PQueue({ concurrency: 1 })
  const threads = options.threads ?? defaultServerOptions.threads

  const installed = () =>
    [
      options.model,
      ...WHISPER_MODELS.filter((model) => model !== options.model),
    ].filter((model) => existsSync(getModelPath(model, options.modelDir)))

  const routes = new Hono()
    .post(
      "/audio/transcriptions",
      openApi({
        tags: ["Transcriptions"],
        summary: "Transcribe audio",
        description:
          "OpenAI-compatible transcription endpoint. Send the audio as multipart form data.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": { schema: transcriptionRequestSchema },
          },
        },
        responses: {
          200: {
            description:
              "json and verbose_json answer with JSON. text, srt and vtt answer with plain text.",
            content: {
              "application/json": {
                schema: z.union([
                  transcriptionSchema,
                  verboseTranscriptionSchema,
                ]),
              },
              "text/plain": { schema: { type: "string" } },
            },
          },
          400: error(
            "The form is malformed, or the server does not have the model or language.",
          ),
          ...errorResponses,
        },
      }),
      async (c) => {
        const form = await c.req.formData().catch(() => {
          throw new HTTPException(400, {
            message: "Expected the audio as multipart form data",
          })
        })
        const granularities = [
          ...form.getAll("timestamp_granularities[]"),
          ...form.getAll("timestamp_granularities"),
        ]
        const parsed = transcriptionRequestSchema.safeParse({
          ...Object.fromEntries(form),
          ...(granularities.length > 0 && {
            "timestamp_granularities[]": granularities,
          }),
        })
        if (!parsed.success) {
          throw new HTTPException(400, {
            message: z.prettifyError(parsed.error),
          })
        }
        const input = parsed.data
        const model =
          !input.model || input.model === "whisper-1"
            ? options.model
            : input.model
        if (!(installed() as string[]).includes(model)) {
          throw new HTTPException(400, {
            message: `The server has no ${model} model. Install it with ghost-story install model ${model}`,
          })
        }
        const language = input.language?.toLowerCase()
        if (language && !(LANGUAGES as readonly string[]).includes(language)) {
          throw new HTTPException(400, {
            message: `whisper does not know the language ${language}`,
          })
        }

        await using scratch = await Scratch.create({ sweep: false })
        const path = scratch.unique(extname(input.file.name) || ".audio")
        await writeFile(path, input.file.stream())

        const signal = c.req.raw.signal
        const started = Date.now()
        const result = await inference.add(
          () =>
            recognize(
              path,
              createTiming(),
              {
                model: model as WhisperModel,
                modelDir: options.modelDir,
                language: language as Language | undefined,
                threads,
                processors: options.processors,
                autoInstall: false,
              },
              signal,
            ),
          { signal },
        )

        const duration = await getAudioDuration(path)
        log(
          `Transcribed ${duration.toFixed(0)} s of audio with ${model} in ${((Date.now() - started) / 1000).toFixed(1)} s`,
        )

        const words = result.timeline.filter((entry) => entry.type === "word")
        const toWord = (word: TimelineEntry, space = "") => ({
          word: `${space}${word.text}`,
          start: word.startTime,
          end: word.endTime,
          ...(word.confidence !== undefined && {
            probability: word.confidence,
          }),
        })
        const text = words.map((word) => word.text).join(" ")
        if (input.response_format === "json") {
          return c.json({ text })
        }
        if (input.response_format === "text") {
          return c.text(text)
        }

        const segments: NonNullable<VerboseTranscription["segments"]> = []
        let current: TimelineEntry[] = []
        for (const [index, word] of words.entries()) {
          current.push(word)
          const next = words[index + 1]
          if (
            !next ||
            /[.!?。！？]$/.test(word.text) ||
            next.startTime - word.endTime > SEGMENT_PAUSE_SECONDS ||
            current.length >= SEGMENT_MAX_WORDS
          ) {
            segments.push({
              id: segments.length,
              start: current[0]?.startTime ?? word.startTime,
              end: word.endTime,
              text: current.map((entry) => entry.text).join(" "),
              words: current.map((entry) => toWord(entry, " ")),
            })
            current = []
          }
        }

        if (
          input.response_format === "srt" ||
          input.response_format === "vtt"
        ) {
          const separator = input.response_format === "srt" ? "," : "."
          const cues = segments.map(
            (segment) =>
              `${input.response_format === "srt" ? `${segment.id + 1}\n` : ""}${timestamp(segment.start, separator)} --> ${timestamp(segment.end, separator)}\n${segment.text}\n`,
          )
          return c.text(
            `${input.response_format === "vtt" ? "WEBVTT\n\n" : ""}${cues.join("\n")}`,
          )
        }

        const granularity = input["timestamp_granularities[]"]
        return c.json({
          task: "transcribe",
          language: result.language ?? language ?? "",
          duration,
          text,
          ...(granularity.includes("segment") && { segments }),
          ...(granularity.includes("word") && {
            words: words.map((word) => toWord(word)),
          }),
        } satisfies VerboseTranscription)
      },
    )
    // no post config route
    .get(
      "/config",
      openApi({
        tags: ["Transcriptions"],
        summary: "Read the whisper.cpp server config",
        deprecated: true,
        description:
          "Only used by Storyteller's `whisper-server` transcription engine. Returns the config used for transciption alignment.",
        responses: { 200: whisperServerConfigSchema, ...errorResponses },
      }),
      (c) =>
        c.json({
          threads,
          processors: options.processors ?? 1,
          max_threads: threads,
          max_processors: options.processors ?? defaultServerOptions.processors,
          model: options.model,
          // this is basically to distinguish between the "real" whisper.cpp server and ours
          // so WhisperServerSTT does not try to detect split boundaries: we already correct them
          corrected: true,
        }),
    )

  return {
    name: "transcriptions",
    routes,
    capabilitiesSchema: transcriptionCapabilitiesSchema,
    capabilities: () => ({ defaultModel: options.model }),
    models: () =>
      installed().map((model): Model => ({
        id: model,
        object: "model",
        created: 0,
        owned_by: "ghost-story",
        service: "transcriptions",
      })),
    [Symbol.asyncDispose]: () => Promise.resolve(),
  }
}
