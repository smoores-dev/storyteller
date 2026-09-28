import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import PQueue from "p-queue"

import { probeSource } from "../audio/DecodePcm.ts"
import { PCM_SAMPLE_RATE, type SourceInfo } from "../audio/PlanBlocks.ts"
import {
  CTC_MODEL_FAMILIES,
  type CtcDevice,
  ctcDeviceCapabilities,
  ctcModelLanguages,
  resolveCtcDevice,
} from "../constants.ts"
import {
  type CtcRun,
  type CtcRunOptions,
  type LoadedCtcModel,
  loadCtcModel,
  resolveCtcRun,
} from "../emission/CtcModel.ts"
import { emitTracks } from "../emission/EmitTracks.ts"
import { Scratch } from "../utilities/Scratch.ts"

import { type FileStore } from "./files.ts"
import { type Jobs, serviceRoutes } from "./jobs.ts"
import { error, errorResponses, openApi } from "./openapi.ts"
import {
  type EmissionCapabilities,
  type RemoteEmissionResult,
  type RemoteCtcRun,
  emissionCapabilitiesSchema,
  emissionInputSchema,
  emissionResultSchema,
  remoteCtcRunSchema,
  runQuerySchema,
} from "./protocol.ts"
import { type Service } from "./server.ts"

export interface EmissionServiceOptions {
  jobs: Jobs
  files: FileStore
  device?: CtcDevice | null | undefined
  batchSize?: number | null | undefined
  buildVariant?: string | null | undefined
  modelDir?: string | undefined
  ffmpegPath?: string | undefined
  ffprobePath?: string | undefined
  concurrency?: number | null | undefined
  inference?: PQueue | undefined
  log?: ((message: string) => void) | undefined
  load?: ((run: CtcRun) => Promise<LoadedCtcModel>) | undefined
}

type Entry = { model: Promise<LoadedCtcModel>; users: number }

type EmissionTask = {
  file: string
  run: CtcRun
  source: SourceInfo
  range: RemoteEmissionResult["range"]
}

export function remoteRun(run: CtcRun): RemoteCtcRun {
  return {
    variant: run.variant,
    dtype: run.dtype,
    device: run.device,
    batchSize: run.batchSize,
    chunkSeconds: run.chunkSeconds,
    startOffsetSeconds: run.startOffsetSeconds,
    endOffsetSeconds: run.endOffsetSeconds,
  }
}

export function emissionService(
  options: EmissionServiceOptions,
): Service<EmissionCapabilities> {
  const { jobs, files } = options
  const log = options.log ?? (() => {})
  const load =
    options.load ??
    ((run: CtcRun) => loadCtcModel(run, { modelDir: options.modelDir }))

  let device = resolveCtcDevice(options.device, options.buildVariant)
  const entries = new Map<string, Entry>()
  let latest: string | null = null
  const inference = options.inference ?? new PQueue({ concurrency: 1 })

  const evict = async () => {
    for (const [key, entry] of entries) {
      if (key === latest || entry.users > 0) {
        continue
      }
      entries.delete(key)
      await entry.model.then(
        (model) => model[Symbol.asyncDispose](),
        () => undefined,
      )
    }
  }

  const acquire = async (run: CtcRun) => {
    const key = `${run.variant}:${run.dtype}:${run.device}:${run.batchSize}`
    let entry = entries.get(key)
    if (!entry) {
      const model = load(run)
      entry = { model, users: 0 }
      entries.set(key, entry)
      model.catch(() => entries.delete(key))
    }
    latest = key
    entry.users++
    const release = async () => {
      entry.users--
      await evict()
    }
    try {
      const model = await entry.model
      if (model.run.device !== device) {
        log(
          `${run.variant} could not run on ${device}, serving ${model.run.device} from now on`,
        )
        device = model.run.device
      }
      await evict()
      return { model, [Symbol.asyncDispose]: release }
    } catch (cause) {
      await release()
      throw cause
    }
  }

  const resolve = (
    query: Omit<CtcRunOptions, "device" | "batchSize" | "buildVariant">,
  ) => {
    try {
      return resolveCtcRun({
        ...query,
        device,
        batchSize: options.batchSize,
        buildVariant: options.buildVariant,
      })
    } catch (cause) {
      throw new HTTPException(400, {
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  const routes = new Hono()
    .get(
      "/emissions/run",
      openApi({
        tags: ["Emissions"],
        summary: "Resolve the run a request would get",
        description:
          "Responds with the model, precision and device a request with the same parameters would run on. Use it to decide whether emissions from earlier are still valid, before uploading anything.",
        request: { query: runQuerySchema },
        responses: {
          200: remoteCtcRunSchema,
          400: error(
            "The query is malformed, or the model family has no model for the language.",
          ),
          ...errorResponses,
        },
      }),
      (c) => c.json(remoteRun(resolve(c.req.valid("query")))),
    )
    .route(
      "/emissions",
      serviceRoutes({
        jobs,
        type: "emissions",
        tag: "Emissions",
        summary: "Compute the emissions of an uploaded file",
        description:
          "The result points at a `.emissions` file in /v1/files. The server runs one model at a time and decodes the audio of the next request in the meantime.",
        input: emissionInputSchema,
        result: emissionResultSchema,
        jobId: "EmissionJob",
        errors: {
          400: error(
            "The body is malformed, the model family has no model for the language, or the range is off the chunk grid.",
          ),
          404: error("The server does not have the file. Upload it first."),
          422: error("ffprobe could not read the file."),
        },
        prepare: async (input): Promise<EmissionTask> => {
          const run = resolve(input)
          await using file = await files.open(input.file)
          if (!file) {
            throw new HTTPException(404, {
              message: `No file ${input.file}, upload it first`,
            })
          }
          const probed = await probeSource(
            file.path,
            options.ffprobePath,
          ).catch((cause: unknown) => {
            throw new HTTPException(422, {
              message: `Could not read the uploaded audio: ${cause instanceof Error ? cause.message : String(cause)}`,
            })
          })

          const size = Math.round(run.chunkSeconds * PCM_SAMPLE_RATE)
          const total = Math.round(probed.durationSeconds * PCM_SAMPLE_RATE)
          const count = probed.seekable ? Math.ceil(total / size) : 1
          const toChunk = (seconds: number) => {
            const chunk = (seconds * PCM_SAMPLE_RATE) / size
            return Math.abs(chunk - Math.round(chunk)) < 1e-6
              ? Math.round(chunk)
              : Number.NaN
          }
          const startChunk = toChunk(input.range?.start ?? 0)
          const endIsLast = input.range?.end === undefined
          const endChunk =
            input.range?.end === undefined ? count : toChunk(input.range.end)
          if (
            !(startChunk >= 0 && startChunk < count) ||
            !(endChunk > startChunk && (endIsLast || endChunk < count))
          ) {
            throw new HTTPException(400, {
              message: `A range starts and ends on a multiple of ${run.chunkSeconds} s, and the range that reaches the end of the file leaves out end. This file has ${count} chunks.`,
            })
          }

          return {
            file: input.file,
            run,
            source: {
              ...probed,
              range: {
                start: startChunk * size,
                end: endIsLast ? null : endChunk * size,
              },
            },
            range: {
              start: (startChunk * size) / PCM_SAMPLE_RATE,
              end: endIsLast
                ? probed.durationSeconds
                : (endChunk * size) / PCM_SAMPLE_RATE,
            },
          }
        },
        handler: async (task, { signal, progress }) => {
          await using file = await files.open(task.file)
          if (!file) {
            throw new Error("The uploaded file expired, upload it again")
          }
          await using lease = await acquire(task.run)
          await using scratch = await Scratch.create({ sweep: false })
          const output = scratch.unique(".emissions")
          const tracks = emitTracks(
            [{ ...task.source, path: file.path }],
            [output],
            lease.model,
            {
              signal,
              scratch,
              compute: (work) => inference.add(work, { signal }),
              ffmpegPath: options.ffmpegPath,
              concurrency: options.concurrency,
              onBlock: progress,
            },
          )
          for await (const track of tracks) {
            const { spans: _spans, ...timing } = track.timing
            log(
              `Emitted ${timing.metadata["audioLength"] ?? "?"} s of audio with ${lease.model.run.variant} on ${lease.model.run.device} in ${(timing.wallClockMs / 1000).toFixed(1)} s`,
            )
            return {
              run: remoteRun(lease.model.run),
              range: task.range,
              timing,
              emissions: await files.adopt(output, {
                ext: ".emissions",
                signal,
              }),
            }
          }
          throw new Error("The audio produced no emissions")
        },
      }),
    )

  return {
    name: "emissions",
    routes,
    capabilitiesSchema: emissionCapabilitiesSchema,
    capabilities: () => ({
      device,
      devices: ctcDeviceCapabilities(options.buildVariant).available,
    }),
    models: () =>
      CTC_MODEL_FAMILIES.map((family) => ({
        id: family,
        object: "model" as const,
        created: 0,
        owned_by: "ghost-story",
        service: "emissions",
        languages: ctcModelLanguages(family),
      })),
    async [Symbol.asyncDispose]() {
      latest = null
      await evict()
    },
  }
}
