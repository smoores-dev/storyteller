#!/usr/bin/env node

import { randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import * as os from "node:os"
import { join } from "node:path"

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
  granularityParser,
  languageParser,
  loggingParser,
} from "../common/parse.ts"
import { markup } from "../markup/markup.ts"
import { markupCommand } from "../markup/parse.ts"
import { processCommand, processParser } from "../process/parse.ts"
import { processAudiobook } from "../process/processAudiobook.ts"
import { transcribeCommand, transcribeParser } from "../transcribe/parse.ts"
import { transcribe } from "../transcribe/transcribe.ts"

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
  granularityParser,
  languageParser,
  alignParser,
  loggingParser,
)

const parser = or(
  processCommand,
  transcribeCommand,
  markupCommand,
  alignCommand,
  pipelineCommand,
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

  const logger = createLogger(parsed.logLevel)

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

    case "markup": {
      const timing = await markup(parsed.input, parsed.output, {
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
      const timing = await align(
        parsed.epub,
        parsed.output,
        parsed.transcriptions,
        parsed.audiobook,
        {
          granularity: parsed.granularity,
          primaryLocale: parsed.language,
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
      using epub = await Epub.from(parsed.epub)

      const primaryLocale =
        parsed.language ??
        (await epub.getLanguage()) ??
        new Intl.Locale("en-US")

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

      const markupTiming = await markup(parsed.epub, markedup, {
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

      logger.info("Aligning EPUB with audiobook...")

      startProgressBar()

      const alignTiming = await align(
        markedup,
        parsed.output,
        transcriptions,
        processedAudio,
        {
          granularity: parsed.granularity,
          primaryLocale,
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
    }
  }
}

main().catch((e: unknown) => {
  console.error(e)
})
