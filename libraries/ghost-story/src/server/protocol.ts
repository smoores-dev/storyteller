import { z } from "zod/v4"

import {
  CTC_DEVICES,
  CTC_DTYPES,
  CTC_MODEL_FAMILIES,
  CTC_MODEL_VARIANTS,
} from "../constants.ts"

export const PROTOCOL_VERSION = 1

const resolvedCtcDevice = z.enum(CTC_DEVICES).exclude(["auto"])

export const errorSchema = z
  .object({ error: z.string() })
  .meta({ id: "Error", description: "What went wrong, in plain English." })

export const remoteCtcRunSchema = z
  .object({
    variant: z.enum(CTC_MODEL_VARIANTS),
    dtype: z.enum(CTC_DTYPES),
    device: resolvedCtcDevice,
    batchSize: z.int().positive().meta({
      description:
        "How many chunks go through the model at once. Defined by server.",
    }),
    chunkSeconds: z.number().positive().meta({
      description:
        "The length of a single chunk feeding into the model. Ranges start and end on multiples of it.",
    }),
    startOffsetSeconds: z.number(),
    endOffsetSeconds: z.number(),
  })
  .meta({
    id: "RemoteCtcRun",
    description:
      "The details of a specific CTC run. Used to store in emissions headers for follow ups",
  })

export type RemoteCtcRun = z.infer<typeof remoteCtcRunSchema>

export const emissionCapabilitiesSchema = z
  .object({
    device: resolvedCtcDevice.meta({
      description:
        "The device (type of GPU/CPU) the server runs models on right now.",
    }),
    devices: z.array(resolvedCtcDevice).meta({
      description: "Every device (type of GPU/CPU) available on this machine.",
    }),
  })
  .meta({ id: "EmissionCapabilities" })

export type EmissionCapabilities = z.infer<typeof emissionCapabilitiesSchema>

const runFields = {
  model: z.enum(CTC_MODEL_FAMILIES).default("mms").meta({
    description: "The model family.",
  }),
  language: z.string().min(1).optional().meta({
    description:
      "A language code such as en or zh. Families with one model per language need it.",
  }),
  dtype: z.enum(CTC_DTYPES).optional().meta({
    description:
      "The precision on a GPU. Leave it out for the family's default. The CPU always runs fp32.",
  }),
}

export const runQuerySchema = z.object(runFields)

export const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .meta({ description: "SHA-256 of the file, in lowercase hex." })

export const storedFileSchema = z
  .object({ sha256: sha256Schema, size: z.int().nonnegative() })
  .meta({ id: "StoredFile" })

export type StoredFile = z.infer<typeof storedFileSchema>

export const fileQuerySchema = z.object({
  ext: z
    .string()
    .regex(/^\.[A-Za-z0-9]{1,8}$/)
    .optional()
    .meta({
      description:
        "The extension of the file, such as .mp3 or .m4b. It helps ffmpeg recognize the format.",
    }),
})

export const JOB_STATES = [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
] as const

export type JobState = (typeof JOB_STATES)[number]

export function jobSchema<Result extends z.ZodType>(
  result: Result,
  id: string,
) {
  return z
    .object({
      id: z.string(),
      type: z
        .string()
        .meta({ description: "The kind of work, such as emissions." }),
      state: z.enum(JOB_STATES),
      revision: z.int().nonnegative().meta({
        description:
          "Increments one on every change. Pass it back as revision to wait for the next change.",
      }),
      progress: z
        .object({ done: z.int().nonnegative(), total: z.int().nonnegative() })
        .nullable(),
      result: result.nullable().meta({
        description: "What the job produced, once it is done.",
      }),
      error: z.string().nullable(),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    })
    .meta({ id })
}

export type Job<Result = unknown> = Omit<
  z.infer<ReturnType<typeof jobSchema<z.ZodUnknown>>>,
  "result"
> & { result: Result | null }

export const jobQuerySchema = z.object({
  wait: z.coerce.number().int().min(0).max(30).optional().meta({
    description:
      "Hold the request for up to this many seconds until the job changes.",
  }),
  revision: z.coerce.number().int().nonnegative().optional().meta({
    description:
      "The revision the client already has. Waiting ends when the job moves past it.",
  }),
})

export const emissionInputSchema = z
  .object({
    file: sha256Schema.meta({
      description: "SHA-256 of an audio file uploaded to /v1/files.",
    }),
    ...runFields,
    range: z
      .object({
        start: z.number().nonnegative(),
        end: z.number().positive().optional(),
      })
      .optional()
      .meta({
        description:
          "Range of the file to compute, on multiples of the run's chunkSeconds. Omit to run to the end of the file. Emissions of consecutive ranges join into the emissions of the whole file.",
      }),
  })
  .meta({ id: "EmissionInput" })

export type EmissionInput = z.input<typeof emissionInputSchema>

const timingSchema = z
  .object({
    totalMs: z.number(),
    wallClockMs: z.number(),
    phases: z.array(
      z.object({
        name: z.string(),
        duration: z.number(),
        percentage: z.number(),
      }),
    ),
    metadata: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]),
    ),
  })
  .meta({
    description: "Duration of each stage. Meant for logs.",
  })

export const emissionResultSchema = z
  .object({
    run: remoteCtcRunSchema,
    range: z
      .object({ start: z.number(), end: z.number() })
      .meta({ description: "The seconds of the file the emissions cover." }),
    timing: timingSchema,
    emissions: storedFileSchema.meta({
      description: "The .emissions file. Download it from /v1/files.",
    }),
  })
  .meta({ id: "EmissionResult" })

export type RemoteEmissionResult = z.infer<typeof emissionResultSchema>

export const modelSchema = z
  .object({
    id: z.string().meta({ description: "What to pass as model." }),
    object: z.literal("model"),
    created: z.int(),
    owned_by: z.string(),
    service: z
      .string()
      .meta({ description: "The service that runs the model." }),
    languages: z.array(z.string()).optional().meta({
      description:
        "The languages the model supports, for families with one model per language.",
    }),
  })
  .meta({ id: "Model" })

export type Model = z.infer<typeof modelSchema>

export const modelListSchema = z
  .object({ object: z.literal("list"), data: z.array(modelSchema) })
  .meta({ id: "ModelList" })

export const TRANSCRIPTION_FORMATS = [
  "json",
  "text",
  "srt",
  "vtt",
  "verbose_json",
] as const

export const transcriptionRequestSchema = z
  .object({
    file: z.instanceof(File).meta({
      description: "The audio file.",
      override: { type: "string", format: "binary" },
    }),
    model: z.string().optional().meta({
      description:
        "A whisper model installed on the server, such as large-v3-turbo. whisper-1 or leaving it out uses the server's default.",
    }),
    language: z.string().optional().meta({
      description: "An ISO 639-1 language code. Leave it out to detect it.",
    }),
    prompt: z.string().optional().meta({ description: "Ignored." }),
    temperature: z.coerce.number().optional().meta({ description: "Ignored." }),
    response_format: z.enum(TRANSCRIPTION_FORMATS).default("json"),
    "timestamp_granularities[]": z
      .array(z.enum(["word", "segment"]))
      .default(["segment"])
      .meta({
        description:
          "The timestamps verbose_json includes. Word timestamps come at no extra cost.",
      }),
  })
  .meta({ id: "TranscriptionRequest" })

export const transcriptionSchema = z
  .object({ text: z.string() })
  .meta({ id: "Transcription" })

const transcriptionWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
  probability: z.number().optional(),
})

export const verboseTranscriptionSchema = z
  .object({
    task: z.literal("transcribe"),
    language: z.string(),
    duration: z.number(),
    text: z.string(),
    segments: z
      .array(
        z.object({
          id: z.int(),
          start: z.number(),
          end: z.number(),
          text: z.string(),
          words: z.array(transcriptionWordSchema).meta({
            description:
              "The words of this segment, each with a leading space, the way the whisper.cpp server writes them. OpenAI does not send these. Storyteller's whisper-server engine reads them.",
          }),
        }),
      )
      .optional(),
    words: z.array(transcriptionWordSchema).optional(),
  })
  .meta({ id: "VerboseTranscription" })

export type VerboseTranscription = z.infer<typeof verboseTranscriptionSchema>

export const whisperServerConfigSchema = z
  .object({
    threads: z.int(),
    processors: z.int(),
    max_threads: z.int(),
    max_processors: z.int(),
    model: z.string(),
    corrected: z.literal(true).meta({
      description:
        "Only a notice for Storyteller's whisper-server engine to not correct already corrected timestamps.",
    }),
  })
  .meta({ id: "WhisperServerConfig" })

export const transcriptionCapabilitiesSchema = z
  .object({
    defaultModel: z
      .string()
      .meta({ description: "The model whisper-1 stands for." }),
  })
  .meta({ id: "TranscriptionCapabilities" })

export type TranscriptionCapabilities = z.infer<
  typeof transcriptionCapabilitiesSchema
>
