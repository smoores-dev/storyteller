import { type PipelineCtx } from "./ctx"
import { type ScanInput } from "./types"

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

// annoying hack needed to get type narrowing to work through steps
type NarrowOutput<Output, Narrowed> = Output extends null
  ? null
  : Prettify<Output & Narrowed>

export class ScanAbortedError extends Error {
  constructor(step: string) {
    super(`Scan aborted before step "${step}"`)
    this.name = "ScanAbortedError"
  }
}

/* helper to describe the value of a change in one line for logging */
function describeValue(v: unknown): string {
  if (v === null) return "null"
  if (typeof v === "string")
    return v.length > 60 ? `<string len=${v.length}>` : `"${v}"`
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) return `<array len=${v.length}>`
  if (typeof v === "object") return "<object>"
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(v)
}

function summarizeDelta(input: ScanInput, output: unknown): string | null {
  if (output === null) return "→ null"
  if (typeof output !== "object" || Array.isArray(output)) return null

  const inObj = input as unknown as Record<string, unknown>
  const outObj = output as Record<string, unknown>
  const changes: string[] = []
  for (const key of Object.keys(outObj)) {
    if (key === "book") continue
    if (!(key in inObj)) {
      changes.push(`+${key}=${describeValue(outObj[key])}`)
    } else if (inObj[key] !== outObj[key]) {
      changes.push(`~${key}=${describeValue(outObj[key])}`)
    }
  }
  return changes.length ? `→ ${changes.join(", ")}` : null
}

/**
 * Define a step function that can be used in the scanner.
 */
export function defineStep<Input extends ScanInput, Output>(
  step: string,
  fn: (input: Input, ctx: PipelineCtx) => Promise<Output>,
) {
  return async <N extends Input>(
    input: N,
    ctx: PipelineCtx,
  ): Promise<NarrowOutput<Output, N>> => {
    if (ctx.signal.aborted) {
      throw new ScanAbortedError(step)
    }

    const stepCtx = { ...ctx, step }
    const start = performance.now()
    const tag = `[STEP:${step}] ${input.book.title} (${input.format})`

    try {
      stepCtx.logger.debug(tag)

      const result = await fn(input, stepCtx)

      if (process.env["STORYTELLER_LOG_LEVEL"] === "debug") {
        const delta = summarizeDelta(input, result)
        if (delta) stepCtx.logger.debug(`${tag} ${delta}`)
      }

      return result as NarrowOutput<Output, N>
    } catch (err) {
      if (err instanceof ScanAbortedError) {
        throw err
      }

      stepCtx.report.warn({
        step,
        msg: `Step ${step} failed`,
        book: input.book,
        format: input.format,
        err,
      })

      throw err
    } finally {
      ctx.report.recordTiming({
        step,
        durationMs: performance.now() - start,
        bookUuid: input.bookUuid,
        format: input.format,
      })
    }
  }
}
