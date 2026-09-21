// import { randomUUID, timingSafeEqual } from "node:crypto"
// import { rm, writeFile } from "node:fs/promises"
// import { tmpdir } from "node:os"
// import { extname, join } from "node:path"

// import { type ServerType, serve } from "@hono/node-server"
// import { Hono } from "hono"

// import { getModelDir } from "../cli/config.ts"
// import {
//   WAV2VEC2_SECONDS_PER_CHUNK,
//   type Wav2Vec2DataType,
//   type Wav2Vec2Device,
//   type Wav2Vec2Model,
// } from "../constants.ts"
// import {
//   type EmissionWireResult,
//   encodeEmissions,
// } from "../emission/EmissionWire.ts"
// import {
//   type Wav2Vec2ModelBundle,
//   type Wav2Vec2Result,
// } from "../emission/Wav2Vec2Emission.ts"
// import { type Timing, createTiming } from "../utilities/Timing.ts"

// export type EmissionServerEmit = (
//   filePath: string,
//   timing: Timing,
// ) => Promise<Wav2Vec2Result>

// export interface EmissionServerOptions {
//   model: Wav2Vec2Model
//   device: Wav2Vec2Device
//   dtype: Wav2Vec2DataType
//   host: string
//   port: number
//   apiKey?: string | null
//   modelDir?: string
//   loaded?: Wav2Vec2ModelBundle
//   emitImpl?: EmissionServerEmit
// }

// export interface EmissionServerConfig {
//   model: Wav2Vec2Model
//   device: Wav2Vec2Device
//   dtype: Wav2Vec2DataType
//   secondsPerChunk: number
// }

// export async function loadEmissionServerModel(
//   options: EmissionServerOptions,
// ): Promise<Wav2Vec2ModelBundle> {
//   const { loadWav2Vec2Model } = await import("../emission/Wav2Vec2Emission.ts")

//   return loadWav2Vec2Model({
//     model: options.model,
//     modelDir: options.modelDir ?? getModelDir(),
//     device: options.device,
//     dtype: options.dtype,
//   })
// }

// function createLocalEmitter(
//   options: EmissionServerOptions,
// ): EmissionServerEmit {
//   let pending: Promise<Wav2Vec2ModelBundle> | null = null

//   return async (filePath, timing) => {
//     pending ??= options.loaded
//       ? Promise.resolve(options.loaded)
//       : loadEmissionServerModel(options)

//     const loaded = await pending

//     const { emit } = await import("../emission/Wav2Vec2Emission.ts")

//     return emit(filePath, timing, {
//       model: options.model,
//       modelDir: options.modelDir ?? getModelDir(),
//       device: options.device,
//       dtype: options.dtype,
//       loaded,
//     })
//   }
// }

// function createQueue(): <T>(task: () => Promise<T>) => Promise<T> {
//   let tail: Promise<unknown> = Promise.resolve()

//   return <T>(task: () => Promise<T>) => {
//     const result = tail.then(task, task)
//     tail = result.catch(() => undefined)
//     return result
//   }
// }

// function isAuthorized(apiKey: string, header: string | undefined): boolean {
//   const prefix = "Bearer "
//   const provided =
//     header && header.startsWith(prefix) ? header.slice(prefix.length) : ""

//   const expectedBuffer = Buffer.from(apiKey, "utf-8")
//   const providedBuffer = Buffer.from(provided, "utf-8")

//   if (expectedBuffer.length !== providedBuffer.length) {
//     return false
//   }

//   return timingSafeEqual(expectedBuffer, providedBuffer)
// }

// export function createEmissionServer(options: EmissionServerOptions): Hono {
//   const apiKey = options.apiKey ?? null
//   const runEmit = options.emitImpl ?? createLocalEmitter(options)
//   const enqueue = createQueue()

//   const app = new Hono()

//   app.use("*", async (c, next) => {
//     if (!apiKey) {
//       await next()
//       return
//     }

//     if (!isAuthorized(apiKey, c.req.header("Authorization"))) {
//       return c.json({ error: "Unauthorized" }, 401)
//     }

//     await next()
//     return
//   })

//   app.get("/config", (c) => {
//     const config: EmissionServerConfig = {
//       model: options.model,
//       device: options.device,
//       dtype: options.dtype,
//       secondsPerChunk: WAV2VEC2_SECONDS_PER_CHUNK,
//     }
//     return c.json(config)
//   })

//   app.post("/audio/emissions", async (c) => {
//     const body = await c.req.parseBody()
//     const file = body["file"]

//     if (!(file instanceof File)) {
//       return c.json(
//         { error: "Expected a multipart form field named 'file'" },
//         400,
//       )
//     }

//     const filePath = join(
//       tmpdir(),
//       `ghost-story-emission-${randomUUID()}${extname(file.name) || ".wav"}`,
//     )

//     await writeFile(filePath, Buffer.from(await file.arrayBuffer()))

//     try {
//       const timing = createTiming()
//       timing.setMetadata("model", options.model)
//       timing.setMetadata("device", options.device)
//       timing.setMetadata("dtype", options.dtype)

//       const result = await enqueue(() => runEmit(filePath, timing))
//       const { emissions, frames, dims } = encodeEmissions(result.emissions)

//       const wire: EmissionWireResult = {
//         vocab: Object.fromEntries(result.vocab),
//         blankIndex: result.blankIndex,
//         secondsPerChunk: result.secondsPerChunk,
//         framesPerChunk: result.framesPerChunk,
//         secondsPerFrame: result.secondsPerFrame,
//         frames,
//         dims,
//         emissions,
//         timing: timing.summary(),
//       }

//       return c.json(wire)
//     } finally {
//       await rm(filePath, { force: true })
//     }
//   })

//   return app
// }

// export async function startEmissionServer(
//   options: EmissionServerOptions,
// ): Promise<ServerType> {
//   const loaded =
//     options.emitImpl || options.loaded
//       ? options.loaded
//       : await loadEmissionServerModel(options)

//   const app = createEmissionServer({ ...options, ...(loaded && { loaded }) })

//   return serve({
//     fetch: app.fetch,
//     hostname: options.host,
//     port: options.port,
//   })
// }
