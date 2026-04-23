import { hashAudiobookDirectory, hashFile } from "@/assets/hash"
import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import { type Existing, isResolvedFormat } from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

type HashedExtras = {
  fileHash: string
  fileSize: number | null
  existingHash: string
  changed: boolean
}

export async function computeHash<T extends Existing>(
  input: T,
  ctx: ScanCtx,
): Promise<T & HashedExtras> {
  const { hash, fileSize } =
    input.format === "audiobook"
      ? await hashAudiobookDirectory(input.filepath, ctx.signal)
      : await hashFile(input.filepath, ctx.signal)

  const changed =
    !!ctx.options.force || input.isNew || input.existingHash !== hash

  if (isResolvedFormat(input.format)) {
    await updateBook(
      input.bookUuid,
      null,
      getFormatRelationPatch(input, {
        missing: false,
        contentHash: hash,
        fileSize,
      }),
    )
  }

  return {
    ...input,
    fileHash: hash,
    fileSize,
    existingHash: hash,
    changed,
  }
}
