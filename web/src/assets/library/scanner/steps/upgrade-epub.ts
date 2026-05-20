import { cp } from "node:fs/promises"

import { Epub } from "@storyteller-platform/epub"

import { defineStep } from "@/assets/library/scanner/step"
import { type EpubNeedsUpgrade } from "@/assets/library/scanner/types"
import { addIgnoreRule } from "@/database/importRules"
import { getSetting } from "@/database/settings"
import {
  type Epub2ImportStrategy,
  type ImportMode,
} from "@/database/settingsTypes"

const STEP = "upgrade-epub"

function effectiveEpub2Strategy(
  strategy: Epub2ImportStrategy,
  importMode: ImportMode,
): Epub2ImportStrategy {
  if (importMode === "copy" && strategy === "replace") {
    return "backup-and-convert"
  }

  return strategy
}

export const upgradeEpubStep = defineStep(
  "upgrade-epub",
  async (input: EpubNeedsUpgrade, ctx) => {
    const [configuredStrategy, backupSuffix, importMode] = await Promise.all([
      getSetting("epub2ImportStrategy"),
      getSetting("epub2BackupSuffix"),
      getSetting("importMode"),
    ])

    const strategy = effectiveEpub2Strategy(configuredStrategy, importMode)

    if (strategy === "skip") {
      ctx.report.warn({
        step: STEP,
        msg: `Unknown EPUB is EPUB 2. We will not import it, because the conversion strategy is skip`,
      })
      return null
    }

    if (strategy === "backup-and-convert") {
      const backupPath = input.filepath.replace(
        /\.epub$/i,
        `${backupSuffix}.epub`,
      )
      await addIgnoreRule(backupPath)
      await cp(input.filepath, backupPath)
    }

    const upgraded = await Epub.upgrade(input.filepath)
    await upgraded.saveAndClose()

    const scope = ctx.scope
    if (!scope) {
      throw new Error("upgrade-epub step requires ctx.scope")
    }

    const epub = scope.use(
      await Epub.from(input.filepath, { metadataOnly: true }),
    )
    return { ...input, isEpub2: false as const, epub }
  },
)
