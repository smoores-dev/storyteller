#!/usr/bin/env node

import { randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import * as os from "node:os"
import { basename, join } from "node:path"

import {
  constant,
  group,
  integer,
  merge,
  message,
  object,
  option,
  optional,
  or,
  withDefault,
} from "@optique/core"
import { run } from "@optique/run"
import { path } from "@optique/run/valueparser"
import { Presets, SingleBar } from "cli-progress"

import { Epub } from "@storyteller-platform/epub"

import packageJson from "../../package.json" with { type: "json" }
import { align } from "../align/align.ts"
import { alignCommand, alignParser } from "../align/parse.ts"
import { createLogger } from "../common/logging.ts"
import {
  autoUpgradeParser,
  granularityParser,
  languageParser,
  loggingParser,
  removeNcxParser,
} from "../common/parse.ts"
import { markup } from "../markup/markup.ts"
import { markupCommand } from "../markup/parse.ts"
import { processCommand, processParser } from "../process/parse.ts"
import { processAudiobook } from "../process/processAudiobook.ts"
import { snapshotCommand } from "../snapshot/parse.ts"
import { snapshotAlignment } from "../snapshot/snapshot.ts"
import { transcribeCommand, transcribeParser } from "../transcribe/parse.ts"
import { transcribe } from "../transcribe/transcribe.ts"
import { upgradeEpubCommand } from "../upgradeEpub/parse.ts"
import { upgradeEpub } from "../upgradeEpub/upgradeEpub.ts"

const pipelineCommand = merge(
  object({
    action: constant("pipeline"),
    processedAudio: optional(
      option("--processed-audio", path({ type: "directory" })),
    ),
    transcriptions: optional(
      option("--transcriptions", path({ type: "directory" })),
    ),
    markedup: optional(
      option("--markedup", path({ type: "file", extensions: [".epub"] })),
    ),
    parallelTranscodes: withDefault(
      option("--parallel-transcodes", integer()),
      1,
    ),
    parallelTranscribes: withDefault(
      option("--parallel-transcribes", integer()),
      1,
    ),
    output: option("--output", path({ type: "file", extensions: [".epub"] })),
  }),
  processParser,
  group("Transcription", transcribeParser),
  autoUpgradeParser,
  removeNcxParser,
  granularityParser,
  languageParser,
  alignParser,
  loggingParser,
)

const parser = or(
  processCommand,
  transcribeCommand,
  upgradeEpubCommand,
  markupCommand,
  alignCommand,
  pipelineCommand,
  snapshotCommand,
)

async function main() {
  const parsed = run(parser, {
    showChoices: true,
    showDefault: true,
    version: packageJson.version,
    completion: "command",
    help: "both",
    description: message`A CLI to automatically align audiobooks and EPUB files, producing EPUBs with Media Overlays.`,
  })

  const controller = new AbortController()

  let progressBar!: SingleBar

  function resetProgressBar() {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    progressBar?.stop()

    progressBar = new SingleBar(
      { etaBuffer: 4, hideCursor: null, noTTYOutput: !process.stderr.isTTY },
      Presets.shades_classic,
    )
  }

  function startProgressBar() {
    if (parsed.action === "upgrade-epub") return

    if (!parsed.noProgress && parsed.logLevel === "silent") {
      progressBar.start(100, 0)
    }
  }

  resetProgressBar()

  process.on("SIGINT", () => {
    controller.abort()
    process.exit()
  })

  using stack = new DisposableStack()
  stack.defer(() => {
    progressBar.stop()
  })

  startProgressBar()

  const logger = createLogger(
    parsed.action === "upgrade-epub" ? "warn" : parsed.logLevel,
  )

  switch (parsed.action) {
    case "process": {
      const timing = await processAudiobook(parsed.input, parsed.output, {
        encoding: { codec: parsed.codec, bitrate: parsed.bitrate },
        maxLength: parsed.maxLength / 60,
        parallelism: parsed.parallelism,
        signal: controller.signal,
        logger,
        ...(!parsed.noProgress &&
          parsed.logLevel === "silent" && {
            onProgress: (progress) => {
              progressBar.update(Math.floor(progress * 100))
            },
          }),
      })

      if (parsed.time) {
        timing.print("Process audiobook")
      }

      break
    }

    case "transcribe": {
      const timing = await transcribe(
        parsed.input,
        parsed.output,
        parsed.language ?? new Intl.Locale("en-US"),
        {
          ...parsed,
          signal: controller.signal,
          logger,
          ...(!parsed.noProgress &&
            parsed.logLevel === "silent" && {
              onProgress: (progress) => {
                progressBar.update(Math.floor(progress * 100))
              },
            }),
        },
      )

      if (parsed.time) {
        timing.print("Process audiobook")
      }

      break
    }

    case "upgrade-epub": {
      await upgradeEpub(parsed.input, parsed.output, {
        removeNcx: parsed.removeNcx,
      })
      break
    }

    case "markup": {
      let input = parsed.input
      if (parsed.autoupgrade) {
        logger.info("Upgrading EPUB 2 to EPUB 3")
        input = join(
          os.tmpdir(),
          `stalign-autoupgrade-${randomUUID()}`,
          basename(parsed.input),
        )
        await upgradeEpub(parsed.input, input, { removeNcx: parsed.removeNcx })
      }

      const timing = await markup(input, parsed.output, {
        primaryLocale: parsed.language ?? new Intl.Locale("en-US"),
        granularity: parsed.granularity,
        logger,
        ...(!parsed.noProgress &&
          parsed.logLevel === "silent" && {
            onProgress: (progress) => {
              progressBar.update(Math.floor(progress * 100))
            },
          }),
      })

      if (parsed.time) {
        timing.print("Mark up EPUB")
      }

      break
    }

    case "align": {
      let input = parsed.epub
      if (parsed.autoupgrade) {
        logger.info("Upgrading EPUB 2 to EPUB 3")
        input = join(
          os.tmpdir(),
          `stalign-autoupgrade-${randomUUID()}`,
          basename(parsed.epub),
        )
        await upgradeEpub(parsed.epub, input, { removeNcx: parsed.removeNcx })
      }

      const timing = await align(
        input,
        parsed.output,
        parsed.transcriptions,
        parsed.audiobook,
        {
          granularity: parsed.granularity,
          textRef: parsed.textRef,
          outFormat: parsed.outFormat,
          primaryLocale: parsed.language,
          reportsPath: parsed.reports,
          logger,
          ...(!parsed.noProgress &&
            parsed.logLevel === "silent" && {
              onProgress: (progress) => {
                progressBar.update(Math.floor(progress * 100))
              },
            }),
        },
      )

      if (parsed.time) {
        timing.print("Align EPUB and audiobook")
      }

      break
    }

    case "pipeline": {
      let input = parsed.epub
      if (parsed.autoupgrade) {
        logger.info("Upgrading EPUB 2 to EPUB 3")
        input = join(
          os.tmpdir(),
          `stalign-autoupgrade-${randomUUID()}`,
          basename(parsed.epub),
        )
        await upgradeEpub(parsed.epub, input, { removeNcx: parsed.removeNcx })
      }

      using epub = await Epub.from(input)

      const primaryLocale =
        parsed.language ??
        (await epub.getLanguage()) ??
        new Intl.Locale("en-US")

      epub.discardAndClose()

      const processedAudio =
        parsed.processedAudio ??
        join(os.tmpdir(), `stalign-processed-${randomUUID()}`)

      if (!parsed.processedAudio) {
        stack.defer(() => {
          rmSync(processedAudio, { recursive: true, force: true })
        })
      }

      const processTiming = await processAudiobook(
        parsed.audiobook,
        processedAudio,
        {
          encoding: {
            codec: parsed.codec,
            bitrate: parsed.bitrate,
          },
          maxLength: parsed.maxLength / 60,
          parallelism: parsed.parallelTranscodes,
          signal: controller.signal,
          ...(!parsed.noProgress &&
            parsed.logLevel === "silent" && {
              onProgress: (progress) => {
                progressBar.update(Math.floor(progress * 100))
              },
            }),
        },
      )

      resetProgressBar()

      logger.info(
        `Processing audiobook complete, processed files saved to ${processedAudio}.`,
      )

      if (parsed.time) {
        processTiming.print()
      }

      logger.info("Transcribing...")

      startProgressBar()

      const transcriptions =
        parsed.transcriptions ??
        join(os.tmpdir(), `stalign-transcriptions-${randomUUID()}`)

      if (!parsed.transcriptions) {
        stack.defer(() => {
          rmSync(transcriptions, { recursive: true, force: true })
        })
      }

      const transcribeTiming = await transcribe(
        processedAudio,
        transcriptions,
        primaryLocale,
        {
          ...parsed,
          parallelism: parsed.parallelTranscribes,
          signal: controller.signal,
          logger,
          ...(!parsed.noProgress &&
            parsed.logLevel === "silent" && {
              onProgress: (progress) => {
                progressBar.update(Math.floor(progress * 100))
              },
            }),
        },
      )

      resetProgressBar()

      logger.info(
        `Transcribing audiobook complete, transcriptions saved to ${transcriptions}.`,
      )

      if (parsed.time) {
        transcribeTiming.print()
      }

      const markedup =
        parsed.textRef === "id-fragment"
          ? parsed.markedup ??
            join(os.tmpdir(), `stalign-markedup-${randomUUID()}.epub`)
          : parsed.epub

      if (parsed.textRef === "id-fragment") {
        logger.info("Marking up EPUB...")

        startProgressBar()

        const markedup =
          parsed.markedup ??
          join(os.tmpdir(), `stalign-markedup-${randomUUID()}.epub`)

        if (!parsed.markedup) {
          stack.defer(() => {
            rmSync(markedup, { recursive: true, force: true })
          })
        }

        const markupTiming = await markup(input, markedup, {
          granularity: parsed.granularity,
          primaryLocale,
          logger,
          ...(!parsed.noProgress &&
            parsed.logLevel === "silent" && {
              onProgress: (progress) => {
                progressBar.update(Math.floor(progress * 100))
              },
            }),
        })

        resetProgressBar()

        logger.info(`Markup complete, marked up EPUB saved to ${markedup}.`)

        if (parsed.time) {
          markupTiming.print()
        }
      } else {
        logger.info("Skipping markup, text-range-type set to text-fragment")
      }

      logger.info("Aligning EPUB with audiobook...")

      startProgressBar()

      const alignTiming = await align(
        markedup,
        parsed.output,
        transcriptions,
        processedAudio,
        {
          granularity: parsed.granularity,
          textRef: parsed.textRef,
          outFormat: parsed.outFormat,
          primaryLocale,
          reportsPath: parsed.reports,
          logger,
          ...(!parsed.noProgress &&
            parsed.logLevel === "silent" && {
              onProgress: (progress) => {
                progressBar.update(Math.floor(progress * 100))
              },
            }),
        },
      )

      resetProgressBar()

      logger.info(`Alignment complete, aligned EPUB saved to ${parsed.output}`)

      if (parsed.time) {
        alignTiming.print()
      }
      break
    }

    case "snapshot": {
      await snapshotAlignment(parsed.epub, parsed.transcriptions, parsed.output)
    }
  }
}

main().catch((e: unknown) => {
  console.error(e)
})
