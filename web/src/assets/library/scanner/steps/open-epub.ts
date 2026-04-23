import { Epub, EpubVersionError } from "@storyteller-platform/epub"

import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { type EpubHashed } from "@/assets/library/scanner/types"

const STEP = "open-epub"

type OpenResult<T> =
  | (T & { isEpub2: false; epub: Epub })
  | (T & { isEpub2: true })

export async function openEpub<T extends EpubHashed>(
  input: T,
  ctx: ScanCtx,
  scope: AsyncDisposableStack,
): Promise<OpenResult<T> | null> {
  if (!input.changed) {
    if (input.format === "epub-unknown") {
      ctx.report.warn({
        step: STEP,
        msg: "Unknown EPUB did not change, skipping format determination",
        bookUuid: input.bookUuid,
      })
      return null
    }

    ctx.report.skipped({
      step: STEP,
      bookUuid: input.bookUuid,
      format: input.format,
      reason: "unchanged",
    })
    return null
  }

  try {
    const epub = scope.use(await Epub.from(input.filepath))
    return { ...input, isEpub2: false, epub }
  } catch (error) {
    if (!(error instanceof EpubVersionError)) throw error
    return { ...input, isEpub2: true }
  }
}
