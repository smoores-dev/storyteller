#!/usr/bin/env node
/* eslint-disable no-console */

import {
  defineCommand,
  defineConfig,
  defineOptions,
  processConfig,
} from "@robingenz/zli"
import { Presets, SingleBar } from "cli-progress"
import { ensureDirSync } from "fs-extra"
import { z } from "zod"

import { type RecognitionOptions } from "../api/Recognition.ts"

import {
  BUILD_VARIANTS,
  RECOGNITION_ENGINES,
  WHISPER_CPP_VERSION,
  WHISPER_MODELS,
  getCompatibleVariants,
  getInstalledVariant,
  isValidModel,
  isValidVariant,
} from "./config.ts"
import {
  PlatformMismatchError,
  installBinary,
  installModel,
  installVadModel,
} from "./install.ts"
import {
  IncompatibleBinaryError,
  spawnWhisperServer,
} from "./whisper-server.ts"

const recognitionEngineSchema = z.enum(RECOGNITION_ENGINES)
const whisperModelSchema = z.enum(WHISPER_MODELS)
const buildVariantSchema = z.enum(BUILD_VARIANTS)

type InstallTarget = "binary" | "model" | "vad" | "all"

function isInstallTarget(value: string): value is InstallTarget {
  return ["binary", "model", "vad", "all"].includes(value)
}

const installCommand = defineCommand({
  description: `Install whisper.cpp binary and models.

Usage:
  ghost-story install binary [variant]  - Install binary (auto-detects platform if variant not specified)
  ghost-story install model <model>     - Install a whisper model
  ghost-story install vad               - Install Silero VAD model
  ghost-story install all               - Install binary, all models, and VAD`,
  args: z.union([
    z.tuple([
      z
        .enum(["binary", "model", "vad", "all"])
        .describe("What to install: binary, model, vad, or all"),
    ]),
    z.tuple([
      z
        .enum(["binary", "model", "vad", "all"])
        .describe("What to install: binary, model, vad, or all"),
      z
        .string()
        .optional()
        .describe("Variant (for binary) or model name (for model)"),
    ]),
  ]),
  options: defineOptions(
    z.object({
      force: z
        .boolean()
        .default(false)
        .describe("Force installation even if platform doesn't match"),
      list: z
        .boolean()
        .default(false)
        .describe("List available variants or models"),
    }),
    { f: "force", l: "list" },
  ),
  action: async (options, args) => {
    const [target, argument] = args
    const force = options.force
    const list = options.list

    if (list) {
      if (target === "binary") {
        console.log("Available binary variants:")
        const compatible = getCompatibleVariants()
        for (const variant of BUILD_VARIANTS) {
          const isCompatible = compatible.includes(variant)
          const marker = isCompatible ? "(compatible)" : ""
          console.log(`  ${variant} ${marker}`)
        }
        console.log("\nCompatible variants for this platform:")
        for (const variant of compatible) {
          console.log(`  ${variant}`)
        }
        return
      }
      if (target === "model") {
        console.log("Available whisper models:")
        for (const model of WHISPER_MODELS) {
          console.log(`  ${model}`)
        }
        return
      }
      console.error("Use --list with 'binary' or 'model'")
      process.exit(1)
    }

    if (!isInstallTarget(target)) {
      console.error(`Unknown install target: ${target as string}`)
      console.error("Valid targets: binary, model, vad, all")
      process.exit(1)
    }

    try {
      if (target === "binary" || target === "all") {
        const variant =
          argument && isValidVariant(argument) ? argument : undefined
        await installBinary({ variant, force, printOutput: true })
      }

      if (target === "model") {
        if (!argument) {
          console.error(
            "Model name required. Usage: ghost-story install model <model>",
          )
          console.error("\nAvailable models:")
          for (const m of WHISPER_MODELS) {
            console.log(`  ${m}`)
          }
          process.exit(1)
        }
        if (!isValidModel(argument)) {
          console.error(`Unknown model: ${argument}`)
          console.error("\nAvailable models:")
          for (const m of WHISPER_MODELS) {
            console.log(`  ${m}`)
          }
          process.exit(1)
        }
        await installModel({ model: argument, force, printOutput: true })
      }

      if (target === "all") {
        console.log("\nInstalling all whisper models...")
        for (const m of WHISPER_MODELS) {
          await installModel({ model: m, force, printOutput: true })
        }
      }

      if (target === "vad" || target === "all") {
        await installVadModel({ force, printOutput: true })
      }

      console.log("\nInstallation complete!")
    } catch (error) {
      if (error instanceof PlatformMismatchError) {
        console.error(`Error: ${error.message}`)
        console.error("\nCompatible variants for this platform:")
        for (const v of error.compatibleVariants) {
          console.log(`  ${v}`)
        }
        process.exit(1)
      }
      throw error
    }
  },
})

const statusCommand = defineCommand({
  description: "Show installation status",
  action: () => {
    const installed = getInstalledVariant()
    if (installed) {
      console.log(`Installed variant: ${installed}`)
    } else {
      console.log("No binary installed")
    }
  },
})

const transcribeCommand = defineCommand({
  description: "Transcribe a single file with whisper.cpp",
  args: z.tuple([z.string().describe("Input audio file path")], {
    errorMap: (issue) => {
      if (issue.code === "too_small") {
        return {
          message: "Input audio file path is required",
        }
      }
      return {
        message: "Input audio file path is required",
      }
    },
  }),
  options: defineOptions(
    z.object({
      output: z
        .string()
        .optional()
        .describe("Output file path for transcription (JSON)"),
      language: z
        .string()
        .default("en-US")
        .describe(
          "BCP 47 language tag representing the primary language of the audio (e.g. en-US)",
        ),
      engine: recognitionEngineSchema
        .default("whisper.cpp")
        .describe("Speech-to-text engine"),
      model: z.string().default("tiny.en").describe("Transcription model"),
      threads: z.coerce.number().default(4).describe("Number of threads"),
      processors: z.coerce.number().default(1).describe("Number of processors"),
      noProgress: z
        .boolean()
        .default(false)
        .describe("Disable the progress bar"),
      noAutoInstall: z
        .boolean()
        .default(false)
        .describe("Don't auto-install missing binary/model"),
      deepgramApiKey: z.string().optional().describe("Deepgram API key"),
      googleApiKey: z.string().optional().describe("Google Cloud API key"),
      amazonRegion: z.string().optional().describe("AWS region code"),
      amazonBucketName: z
        .string()
        .optional()
        .describe("The AWS s3 bucket to upload the provided audio to"),
      amazonAccessKeyId: z.string().optional().describe("AWS access key ID"),
      amazonSecretAccessKey: z
        .string()
        .optional()
        .describe("AWS secret access key"),
    }),
    { m: "model", p: "processors", t: "threads" },
  ),
  action: async (options, args) => {
    const { recognize } = await import("../api/Recognition.ts")
    const progressBar = new SingleBar(
      { etaBuffer: 2, hideCursor: null, noTTYOutput: !process.stderr.isTTY },
      Presets.shades_classic,
    )
    try {
      let [inputPath] = args

      const path = await import("node:path")
      inputPath = path.resolve(process.cwd(), inputPath)
      let outputPath = options.output
        ? path.resolve(process.cwd(), options.output)
        : undefined
      if (outputPath && !path.extname(outputPath)) {
        outputPath = `${outputPath}.json`
      }
      if (outputPath) {
        ensureDirSync(path.dirname(outputPath))
      }

      const result = await recognize(inputPath, {
        engine: options.engine,
        language: options.language,
        options: {
          model: options.model,
          processors: options.processors,
          threads: options.threads,
          autoInstall: !options.noAutoInstall,
          flashAttention: true,
          apiKey: options.googleApiKey ?? options.deepgramApiKey,
          region: options.amazonRegion,
          accessKeyId: options.amazonAccessKeyId,
          secretAccessKey: options.amazonSecretAccessKey,
          bucketName: options.amazonBucketName,

          ...(!options.noProgress && {
            onStart: () => {
              progressBar.start(100, 0)
            },
            onProgress: (progress) => {
              progressBar.update(Math.floor(progress * 100))
            },
          }),
        },
      } as RecognitionOptions)

      if (!outputPath) {
        console.log(JSON.stringify(result, null, 2))
        return
      }

      const { writeFile } = await import("node:fs/promises")
      await writeFile(outputPath, JSON.stringify(result, null, 2))
      console.log(`\nTranscription written to ${outputPath}`)
    } finally {
      if (!options.noProgress) {
        progressBar.stop()
      }
    }
  },
})

const serverCommand = defineCommand({
  description: "Start a whisper.cpp transcription server",
  options: defineOptions(
    z.object({
      model: whisperModelSchema.default("tiny.en").describe("Whisper model"),
      port: z.coerce.number().default(8080).describe("Port to listen on"),
      host: z.string().default("0.0.0.0").describe("Host to bind to"),
      threads: z.coerce.number().default(4).describe("Number of threads"),
      processors: z.coerce.number().default(1).describe("Number of processors"),
      noConvert: z
        .boolean()
        .default(false)
        .describe("Disable automatic audio conversion"),
      noAutoInstall: z
        .boolean()
        .default(false)
        .describe("Don't auto-install missing binary/model"),
      variant: buildVariantSchema
        .optional()
        .describe("Use specific binary variant"),
      force: z
        .boolean()
        .default(false)
        .describe("Force running even if platform doesn't match"),
      vadModel: z
        .string()
        .optional()
        .describe("Path to VAD model for voice activity detection"),
      vadThreshold: z.coerce
        .number()
        .optional()
        .describe("VAD threshold probability (0.0-1.0)"),
    }),
    { m: "model", p: "port", t: "threads", f: "force" },
  ),
  action: async (options) => {
    try {
      await spawnWhisperServer({
        model: options.model,
        port: options.port,
        host: options.host,
        threads: options.threads,
        processors: options.processors,
        convert: !options.noConvert,
        autoInstall: !options.noAutoInstall,
        variant: options.variant,
        force: options.force,
        vadModelPath: options.vadModel,
        vadThreshold: options.vadThreshold,
      })
    } catch (error) {
      if (error instanceof IncompatibleBinaryError) {
        console.error(`Error: ${error.message}`)
        console.error("\nCompatible variants for this platform:")
        for (const v of getCompatibleVariants()) {
          console.log(`  ${v}`)
        }
        process.exit(1)
      }
      throw error
    }
  },
})

const vadCommand = defineCommand({
  description: "Run voice activity detection on an audio file",
  args: z.tuple([z.string().describe("Input audio file path")], {
    errorMap: (issue) => {
      if (issue.code === "too_small") {
        return {
          message: "Input audio file path is required",
        }
      }
      return {
        message: "Input audio file path is required",
      }
    },
  }),
  options: defineOptions(
    z.object({
      output: z
        .string()
        .optional()
        .describe("Output file path for VAD segments (JSON)"),
      threshold: z.coerce
        .number()
        .default(0.5)
        .describe("Speech detection threshold (0.0-1.0)"),
      minSpeechDuration: z.coerce
        .number()
        .default(250)
        .describe("Minimum speech duration in ms"),
      minSilenceDuration: z.coerce
        .number()
        .default(100)
        .describe("Minimum silence duration in ms"),
      speechPad: z.coerce.number().default(30).describe("Speech padding in ms"),
    }),
    { o: "output" },
  ),
  action: async (options, args) => {
    const [inputPath] = args

    const { detectVoiceActivity } = await import("../vad/Silero.ts")

    console.log(`Running VAD on ${inputPath}...`)
    console.log(`  Threshold: ${options.threshold}`)
    console.log(`  Min speech duration: ${options.minSpeechDuration}ms`)
    console.log(`  Min silence duration: ${options.minSilenceDuration}ms`)
    console.log(`  Speech padding: ${options.speechPad}ms`)

    // ensure vad model is installed
    await installVadModel({ force: true, printOutput: true })

    const segments = await detectVoiceActivity(inputPath, {
      threshold: options.threshold,
      minSpeechDurationMs: options.minSpeechDuration,
      minSilenceDurationMs: options.minSilenceDuration,
      speechPadMs: options.speechPad,
      printOutput: true,
    })

    if (options.output !== undefined) {
      const { writeFile } = await import("node:fs/promises")
      await writeFile(options.output, JSON.stringify(segments, null, 2))
      console.log(`\nVAD segments written to ${options.output}`)
    } else {
      console.log("\nVAD segments:")
      console.log(JSON.stringify(segments, null, 2))
    }
  },
})

const config = defineConfig({
  meta: {
    name: "ghost-story",
    version: WHISPER_CPP_VERSION,
    description: `Whisper.cpp management CLI (v${WHISPER_CPP_VERSION})`,
  },
  commands: {
    install: installCommand,
    status: statusCommand,
    transcribe: transcribeCommand,
    server: serverCommand,
    vad: vadCommand,
  },
  defaultCommand: statusCommand,
})

async function main(): Promise<void> {
  try {
    const result = processConfig(config, process.argv.slice(2))
    await result.command.action(result.options, result.args)
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("Error:", err.message)
    } else {
      console.error("Error:", err)
    }
    process.exit(1)
  }
}

void main()
