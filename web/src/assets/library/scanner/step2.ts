import { type ScanCtx } from "./ctx"
import { type ScanInput } from "./types"

// preserves narrowing through steps: if the caller passes a narrower input
// (e.g. with format: 'audiobook'), the output type reflects that narrowing.
// null branches are kept as-is; non-null branches get intersected with the
// caller's narrowed input, which collapses conflicting discriminant branches.
type NarrowOutput<Output, Narrowed> = Output extends null
  ? null
  : Output & Narrowed

export class ScanAbortedError extends Error {
  constructor(step: string) {
    super(`Scan aborted before step "${step}"`)
    this.name = "ScanAbortedError"
  }
}

/**
 * Define a step function that can be used in the scanner.
 */
export function defineStep<Input extends ScanInput, Output>(
  step: string,
  fn: (input: Input, ctx: ScanCtx) => Promise<Output>,
) {
  return async <N extends Input>(
    input: N,
    ctx: ScanCtx,
  ): Promise<NarrowOutput<Output, N>> => {
    if (ctx.signal.aborted) {
      throw new ScanAbortedError(step)
    }

    const stepCtx = { ...ctx, step }

    try {
      stepCtx.logger.debug({ input }, "step started")

      const result = await fn(input, stepCtx)

      stepCtx.logger.debug({ result }, "step finished")

      return result as NarrowOutput<Output, N>
    } catch (err) {
      if (err instanceof ScanAbortedError) {
        throw err
      }

      stepCtx.report.warn({
        step: step,
        msg: `Step ${step} failed before format was resolved for book ${input.book.title} (${input.format})`,
        err,
      })

      throw err
    }
  }
}
