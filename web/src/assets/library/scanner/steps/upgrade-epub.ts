import { cp } from "node:fs/promises"

import { Epub } from "@storyteller-platform/epub"

import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import { createStep } from "@/assets/library/scanner/step"
import {
  type EpubOpenState,
  type EpubOpened,
  isResolvedFormat,
} from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"
import { db } from "@/database/connection"
import { getSetting } from "@/database/settings"
import {
  type Epub2ImportStrategy,
  type ImportMode,
} from "@/database/settingsTypes"

const STEP = "upgrade-epub"

export type UpgradeEpubInput = EpubOpenState
export type UpgradeEpubOutput = EpubOpened

function effectiveEpub2Strategy(
  strategy: Epub2ImportStrategy,
  importMode: ImportMode,
): Epub2ImportStrategy {
  if (importMode === "copy" && strategy === "replace") {
    return "backup-and-convert"
  }

  return strategy
}

export const upgradeEpubStep = createStep<UpgradeEpubInput, UpgradeEpubOutput>(
  STEP,
  async (input, ctx) => {
    if (!input.isEpub2) return input

    const [configuredStrategy, backupSuffix, importMode] = await Promise.all([
      getSetting("epub2ImportStrategy"),
      getSetting("epub2BackupSuffix"),
      getSetting("importMode"),
    ])

    const strategy = effectiveEpub2Strategy(configuredStrategy, importMode)

    if (strategy === "skip") {
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
          reason: "epub2-skipped-by-strategy",
        })
        return null
      }

      ctx.report.warn({
        step: STEP,
        msg: "Unknown EPUB is EPUB 2 and strategy is skip",
        bookUuid: input.bookUuid,
      })
      return null
    }

    if (strategy === "backup-and-convert") {
      const backupPath = input.filepath.replace(
        /\.epub$/i,
        `${backupSuffix}.epub`,
      )
      // ignore backup path
      await db
        .insertInto("importSkipPath")
        .values({
          bookUuid: input.bookUuid,
          filepath: backupPath,
        })
        .execute()
      await cp(input.filepath, backupPath)
    }

    const upgraded = await Epub.upgrade(input.filepath)
    await upgraded.saveAndClose()

    const scope = ctx.scope
    if (!scope) {
      throw new Error("upgrade-epub step requires ctx.scope")
    }

    const epub = scope.use(await Epub.from(input.filepath))
    return { ...input, isEpub2: false, epub }
  },
)
