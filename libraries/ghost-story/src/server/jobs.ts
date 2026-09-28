import { randomUUID } from "node:crypto"

import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import PQueue from "p-queue"
import { z } from "zod/v4"

import { error, errorResponses, openApi } from "./openapi.ts"
import {
  type Job,
  type JobState,
  jobQuerySchema,
  jobSchema,
} from "./protocol.ts"

export interface JobContext {
  signal: AbortSignal
  progress: (done: number, total: number) => void
}

export type JobHandler<Input, Result> = (
  input: Input,
  context: JobContext,
) => Promise<Result>

export interface Jobs {
  register<Input, Result>(
    type: string,
    handler: JobHandler<Input, Result>,
  ): void
  submit(type: string, input: unknown): Promise<Job>
  run(
    type: string,
    input: unknown,
    options: { signal?: AbortSignal | null | undefined },
  ): Promise<unknown>
  get(id: string): Promise<Job | null>
  wait(
    id: string,
    options: { revision: number; timeout: number; signal?: AbortSignal | null },
  ): Promise<Job | null>
  remove(id: string): Promise<boolean>
  [Symbol.asyncDispose]: () => Promise<void>
}

export interface MemoryJobsOptions {
  concurrency?: number | undefined
  idleTimeout?: number | undefined
}

type Entry = {
  job: Job
  input: unknown
  controller: AbortController
  touched: number
  listeners: Set<() => void>
}

const FINISHED: JobState[] = ["done", "failed", "cancelled"]

export function memoryJobs(options: MemoryJobsOptions = {}): Jobs {
  const idleTimeout = options.idleTimeout ?? 10 * 60 * 1000
  const queue = new PQueue({ concurrency: options.concurrency ?? 2 })
  const handlers = new Map<string, JobHandler<unknown, unknown>>()
  const entries = new Map<string, Entry>()

  const handlerFor = (type: string) => {
    const handler = handlers.get(type)
    if (!handler) {
      throw new Error(`Nothing runs ${type} jobs`)
    }
    return handler
  }

  const touch = (id: string) => {
    const entry = entries.get(id)
    if (entry) {
      entry.touched = Date.now()
    }
    return entry ?? null
  }

  const change = (entry: Entry, patch: Partial<Job>) => {
    entry.job = {
      ...entry.job,
      ...patch,
      revision: entry.job.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    for (const listener of entry.listeners) {
      listener()
    }
  }

  const run = async (entry: Entry, handler: JobHandler<unknown, unknown>) => {
    const signal = entry.controller.signal
    change(entry, { state: "running" })
    try {
      const result = await handler(entry.input, {
        signal,
        progress: (done, total) => {
          change(entry, { progress: { done, total } })
        },
      })
      signal.throwIfAborted()
      change(entry, { state: "done", result })
    } catch (cause) {
      change(
        entry,
        signal.aborted
          ? { state: "cancelled" }
          : {
              state: "failed",
              error: cause instanceof Error ? cause.message : String(cause),
            },
      )
    }
  }

  const remove = (id: string) => {
    const entry = entries.get(id)
    if (!entry) {
      return Promise.resolve(false)
    }
    entries.delete(id)
    entry.controller.abort()
    for (const listener of entry.listeners) {
      listener()
    }
    return Promise.resolve(true)
  }

  const sweep = setInterval(
    () => {
      const cutoff = Date.now() - idleTimeout
      for (const [id, entry] of entries) {
        if (entry.touched < cutoff) {
          void remove(id)
        }
      }
    },
    Math.min(idleTimeout, 60 * 1000),
  )
  sweep.unref()

  return {
    register(type, handler) {
      handlers.set(type, handler as unknown as JobHandler<unknown, unknown>)
    },

    submit(type, input) {
      const handler = handlerFor(type)
      const now = new Date().toISOString()
      const entry: Entry = {
        job: {
          id: randomUUID(),
          type,
          state: "queued",
          revision: 0,
          progress: null,
          result: null,
          error: null,
          createdAt: now,
          updatedAt: now,
        },
        input,
        controller: new AbortController(),
        touched: Date.now(),
        listeners: new Set(),
      }
      entries.set(entry.job.id, entry)
      queue
        .add(() => run(entry, handler), { signal: entry.controller.signal })
        .catch(() => {
          if (entry.job.state === "queued") {
            change(entry, { state: "cancelled" })
          }
        })
      return Promise.resolve(entry.job)
    },

    run(type, input, { signal }) {
      const handler = handlerFor(type)
      const aborted = signal ?? new AbortController().signal
      return queue.add(
        () => handler(input, { signal: aborted, progress: () => {} }),
        { signal: aborted },
      )
    },

    get(id) {
      return Promise.resolve(touch(id)?.job ?? null)
    },

    async wait(id, { revision, timeout, signal }) {
      const entry = touch(id)
      if (!entry) {
        return null
      }
      if (
        entry.job.revision === revision &&
        !FINISHED.includes(entry.job.state)
      ) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer)
            entry.listeners.delete(done)
            signal?.removeEventListener("abort", done)
            resolve()
          }
          const timer = setTimeout(done, timeout)
          entry.listeners.add(done)
          signal?.addEventListener("abort", done, { once: true })
        })
      }
      return touch(id)?.job ?? null
    },

    remove,

    async [Symbol.asyncDispose]() {
      clearInterval(sweep)
      queue.clear()
      await Promise.all([...entries.keys()].map((id) => remove(id)))
      await queue.onIdle()
    },
  }
}

export interface ServiceRoutesOptions<
  Input extends z.ZodType,
  Result extends z.ZodType,
  Task,
> {
  jobs: Jobs
  type: string
  tag: string
  summary: string
  description: string
  input: Input
  result: Result
  jobId: string
  errors: Record<number, ReturnType<typeof error>>
  prepare: (input: z.output<Input>) => Promise<Task>
  handler: JobHandler<Task, z.output<Result>>
}

export function serviceRoutes<
  Input extends z.ZodType,
  Result extends z.ZodType,
  Task,
>(options: ServiceRoutesOptions<Input, Result, Task>): Hono {
  const { jobs, type, tag, input, result } = options
  jobs.register(type, options.handler)

  const job = jobSchema(result, options.jobId)
  const notFound = error("No job has this id, or it expired.")
  const param = z.object({ id: z.string() })

  const find = async (id: string) => {
    const found = await jobs.get(id)
    return found?.type === type ? found : null
  }

  return new Hono()
    .post(
      "/",
      openApi({
        tags: [tag],
        summary: options.summary,
        description: `${options.description} Returns the result once the work is done. For long audio, or with a proxy in between that gives up on slow requests, use the jobs route instead.`,
        request: { json: input },
        responses: {
          200: result,
          ...options.errors,
          ...errorResponses,
        },
      }),
      async (c) => {
        const task = await options.prepare(
          c.req.valid("json" as never) as z.output<Input>,
        )
        return c.json(await jobs.run(type, task, { signal: c.req.raw.signal }))
      },
    )
    .post(
      "/jobs",
      openApi({
        tags: [tag],
        summary: `${options.summary}, as a job`,
        description: `${options.description} Returns a job right away. Poll it until it is done, then read its result and remove it.`,
        request: { json: input },
        responses: {
          202: { description: "The job is queued.", schema: job },
          ...options.errors,
          ...errorResponses,
        },
      }),
      async (c) => {
        const task = await options.prepare(
          c.req.valid("json" as never) as z.output<Input>,
        )
        return c.json(await jobs.submit(type, task), 202)
      },
    )
    .get(
      "/jobs/:id",
      openApi({
        tags: [tag],
        summary: "Get a job",
        description:
          "With wait and revision, the server holds the request until the job moves past that revision or wait seconds pass. Clients poll this way. A job nobody asks about for ten minutes is cancelled and removed.",
        request: { param, query: jobQuerySchema },
        responses: { 200: job, 404: notFound, ...errorResponses },
      }),
      async (c) => {
        const { id } = c.req.valid("param")
        const query = c.req.valid("query")
        const known = await find(id)
        const found =
          known && query.wait && query.revision !== undefined
            ? await jobs.wait(id, {
                revision: query.revision,
                timeout: query.wait * 1000,
                signal: c.req.raw.signal,
              })
            : known
        if (!found) {
          throw new HTTPException(404, { message: `No job ${id}` })
        }
        return c.json(found)
      },
    )
    .delete(
      "/jobs/:id",
      openApi({
        tags: [tag],
        summary: "Cancel a job, or remove a finished one",
        description:
          "Remove a job once you have its result. Removing a queued or running job cancels it.",
        request: { param },
        responses: {
          204: { description: "The job is gone." },
          404: notFound,
          ...errorResponses,
        },
      }),
      async (c) => {
        const { id } = c.req.valid("param")
        if (!(await find(id)) || !(await jobs.remove(id))) {
          throw new HTTPException(404, { message: `No job ${id}` })
        }
        return c.body(null, 204)
      },
    )
}
