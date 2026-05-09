import { type ScanCtx } from "./ctx"
import { type Existing, type ScanInput } from "./types"

/**
 * Define a step function that can be used in the scanner.
 */
export function defineStep<
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  Input extends ScanInput,
  Fn extends (input: Input, ctx: ScanCtx) => Promise<unknown>,
>(step: string, fn: Fn) {
  return (async (input, ctx) => {
    const stepCtx = { ...ctx, step }
    try {
      stepCtx.logger.debug({ input }, "step started")

      const result = await fn(input, stepCtx)

      stepCtx.logger.debug({ result }, "step finished")

      return result
    } catch (err) {
      stepCtx.report.warn({
        step: step,
        msg: `Step ${step} failed before format was resolved for book ${input.book.title} (${input.format})`,
        err,
      })

      throw err
    }
  }) as typeof fn
}

const a = defineStep("a", async (input: Existing, _ctx) => {
  await Promise.resolve()
  return {
    ...input,
    b: "b",
  }
})

const b = defineStep(
  "b",
  async (input: Existing & { format: "audiobook"; b: string }, _ctx) => {
    await Promise.resolve()
    return {
      ...input,
      c: "c",
    }
  },
)

const existing = {} as Existing
const context = {} as ScanCtx

const x = await a({ ...existing, format: "audiobook" as const }, context)
let format: 'audiobook' = x.format

const y = await b(x, context)
//    ^?
