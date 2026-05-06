import { type ScanCtx } from "./ctx"
import { type ScanInput, isResolvedFormat } from "./types"

export type Step<TIn extends ScanInput, TOut> = {
  name: string
  run: (input: TIn, ctx: ScanCtx) => Promise<TOut>
}

export function createStep<TIn extends ScanInput, TOut>(
  name: string,
  action: (input: TIn, ctx: ScanCtx) => Promise<TOut>,
): Step<TIn, TOut> {
  return {
    name,
    run: async (input, ctx) => {
      try {
        return await action(input, ctx)
      } catch (err) {
        if (isResolvedFormat(input.format)) {
          ctx.report.failed({
            step: name,
            bookUuid: input.bookUuid,
            format: input.format,
            err,
          })
        } else {
          ctx.report.warn({
            step: name,
            msg: "step failed before format was resolved",
            bookUuid: input.bookUuid,
            err,
          })
        }

        throw err
      }
    },
  }
}
