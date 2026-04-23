import { type Epub } from "@storyteller-platform/epub"

import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import {
  type EpubHashed,
  isResolvedFormat,
} from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

const STEP = "upgrade-epub"

type OpenState<T> =
  | (T & { isEpub2: false; epub: Epub })
  | (T & { isEpub2: true })

export async function upgradeEpub<T extends EpubHashed>(
  input: OpenState<T>,
  ctx: ScanCtx,
): Promise<(T & { isEpub2: false; epub: Epub }) | null> {
  if (!input.isEpub2) return input

  // TODO: implement epub 2 -> epub 3 upgrade.
  if (isResolvedFormat(input.format)) {
    await updateBook(
      input.bookUuid,
      null,
      getFormatRelationPatch(input, { isEpub2: true }),
    )
    ctx.report.skipped({
      step: STEP,
      bookUuid: input.bookUuid,
      format: input.format,
      reason: "epub2-upgrade-not-implemented",
    })
  } else {
    ctx.report.warn({
      step: STEP,
      msg: "Unknown EPUB is EPUB 2, format cannot be resolved",
      bookUuid: input.bookUuid,
    })
  }
  return null
}
