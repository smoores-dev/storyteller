import { createHash } from "node:crypto"
import { createReadStream, openAsBlob } from "node:fs"
import { extname } from "node:path"
import { Readable } from "node:stream"
import { type ReadableStream as NodeReadableStream } from "node:stream/web"

import { type CtcDataType, type CtcModelFamily } from "../constants.ts"
import { createTimeoutAgent } from "../fetch.ts"
import {
  type EmissionCapabilities,
  type RemoteEmissionResult,
  type Job,
  PROTOCOL_VERSION,
  type RemoteCtcRun,
} from "../server/protocol.ts"

export {
  type EmissionCapabilities,
  type RemoteEmissionResult,
  type RemoteCtcRun,
} from "../server/protocol.ts"

export interface CtcServer {
  url: string
  apiKey?: string | null | undefined
  timeout?: number | undefined
}

export interface RemoteRunOptions {
  model?: CtcModelFamily | null | undefined
  language?: string | null | undefined
  dtype?: CtcDataType | null | undefined
}

export interface RemoteEmitOptions {
  signal?: AbortSignal | null | undefined
  range?: { start: number; end?: number | undefined } | undefined
  onProgress?: ((done: number, total: number) => void) | undefined
}

export interface RemoteEmissions {
  body: Readable
  run: RemoteCtcRun
  range: RemoteEmissionResult["range"]
  timing: RemoteEmissionResult["timing"]
}

const DEFAULT_TIMEOUT = 60 * 60 * 1000

const WAIT_SECONDS = 25

type RequestOptions = RequestInit & {
  params?: Record<string, string>
  json?: unknown
  accept?: number[]
}

async function request(
  server: CtcServer,
  path: string,
  { params, json, accept, ...init }: RequestOptions,
) {
  const url = new URL(`${server.url.replace(/\/+$/, "")}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }
  const options: RequestInit & { dispatcher: unknown } = {
    ...init,
    ...(json !== undefined && { body: JSON.stringify(json) }),
    headers: {
      ...(server.apiKey && { Authorization: `Bearer ${server.apiKey}` }),
      ...(json !== undefined && { "Content-Type": "application/json" }),
    },
    dispatcher: createTimeoutAgent(server.timeout ?? DEFAULT_TIMEOUT),
  }
  const response = await fetch(url, options).catch((error: unknown) => {
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause
        : error
    throw new Error(
      `Could not reach the emission server at ${server.url}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause: error },
    )
  })
  if (response.ok || accept?.includes(response.status)) {
    return response
  }
  if (response.status === 401) {
    throw new Error(
      server.apiKey
        ? `The emission server at ${server.url} rejected the API key`
        : `The emission server at ${server.url} needs an API key`,
    )
  }
  const text = await response.text()
  let message = text
  try {
    message = (JSON.parse(text) as { error?: string }).error ?? text
  } catch {
    message = text
  }
  throw new Error(
    `The emission server at ${server.url} answered ${response.status}: ${message}`,
  )
}

function defined(options: RemoteRunOptions) {
  return Object.fromEntries(
    Object.entries({
      model: options.model,
      language: options.language,
      dtype: options.dtype,
    }).filter(([, value]) => value !== null && value !== undefined),
  ) as Record<string, string | number>
}

export async function fetchEmissionCapabilities(
  server: CtcServer,
  signal?: AbortSignal | null,
): Promise<EmissionCapabilities> {
  const response = await request(server, "/v1/capabilities", {
    signal: signal ?? null,
  })
  const capabilities = (await response.json()) as {
    protocol: number
    services: { emissions?: EmissionCapabilities }
  }
  if (capabilities.protocol !== PROTOCOL_VERSION) {
    throw new Error(
      `The server at ${server.url} speaks protocol ${capabilities.protocol}, this client speaks ${PROTOCOL_VERSION}. Update ghost-story on both machines to the same version.`,
    )
  }
  if (!capabilities.services.emissions) {
    throw new Error(`The server at ${server.url} does not serve emissions`)
  }
  return capabilities.services.emissions
}

export async function resolveRemoteCtcRun(
  server: CtcServer,
  options: RemoteRunOptions,
  signal?: AbortSignal | null,
): Promise<RemoteCtcRun> {
  await fetchEmissionCapabilities(server, signal)
  const response = await request(server, "/v1/emissions/run", {
    params: Object.fromEntries(
      Object.entries(defined(options)).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
    signal: signal ?? null,
  })
  return (await response.json()) as RemoteCtcRun
}

export async function hashFile(
  filepath: string,
  signal?: AbortSignal | null,
): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(filepath, {
    signal: signal ?? undefined,
  })) {
    hash.update(chunk as Buffer)
  }
  return hash.digest("hex")
}

export async function uploadFile(
  filepath: string,
  server: CtcServer,
  signal?: AbortSignal | null,
): Promise<string> {
  const sha256 = await hashFile(filepath, signal)
  const known = await request(server, `/v1/files/${sha256}`, {
    method: "HEAD",
    signal: signal ?? null,
    accept: [404],
  })
  if (known.status === 404) {
    const ext = extname(filepath)
    await request(server, `/v1/files/${sha256}`, {
      method: "PUT",
      body: await openAsBlob(filepath),
      params: ext ? { ext } : {},
      signal: signal ?? null,
    })
  }
  return sha256
}

export async function emitRemote(
  filepath: string,
  server: CtcServer,
  runOptions: RemoteRunOptions,
  options: RemoteEmitOptions = {},
): Promise<RemoteEmissions> {
  const signal = options.signal ?? null
  const file = await uploadFile(filepath, server, signal)
  const created = await request(server, "/v1/emissions/jobs", {
    method: "POST",
    json: { file, ...defined(runOptions), range: options.range },
    signal,
  })
  let job = (await created.json()) as Job<RemoteEmissionResult>
  const path = `/v1/emissions/jobs/${job.id}`
  const remove = () =>
    request(server, path, { method: "DELETE", accept: [404] }).catch(
      () => undefined,
    )

  try {
    while (job.state === "queued" || job.state === "running") {
      const response = await request(server, path, {
        params: { wait: String(WAIT_SECONDS), revision: String(job.revision) },
        signal,
      })
      job = (await response.json()) as Job<RemoteEmissionResult>
      if (job.progress) {
        options.onProgress?.(job.progress.done, job.progress.total)
      }
    }
  } finally {
    await remove()
  }
  if (job.state !== "done" || !job.result) {
    throw new Error(
      job.state === "failed"
        ? `The emission server at ${server.url} failed on ${filepath}: ${job.error}`
        : `The emission job for ${filepath} on ${server.url} was ${job.state}`,
    )
  }
  const { run, range, timing, emissions } = job.result
  const download = await request(server, `/v1/files/${emissions.sha256}`, {
    signal,
  })
  if (!download.body) {
    throw new Error(`The emission server at ${server.url} sent no emissions`)
  }
  return {
    body: Readable.fromWeb(download.body as NodeReadableStream<Uint8Array>),
    run,
    range,
    timing,
  }
}
