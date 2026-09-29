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
import PQueue from "p-queue"
import { z } from "zod/v4"

import packageJson from "../../package.json" with { type: "json" }
import { type RecognitionOptions } from "../api/Recognition.ts"
import {
  BUILD_VARIANTS,
  CTC_MODEL_FAMILIES,
  CTC_MODEL_PACKAGES,
  RECOGNITION_ENGINES,
  CTC_DEVICES,
  WHISPER_CPP_VERSION,
  WHISPER_MODELS,
  ctcModelLanguages,
  isCtcModelFamily,
  resolveCtcDevice,
  resolveCtcModelVariant,
} from "../constants.ts"

import {
  getCompatibleVariants,
  getInstalledVariant,
  isValidModel,
  isValidVariant,
} from "./config.ts"
import { installModelPackage } from "./ctc-install.ts"
import {
  PlatformMismatchError,
  installBinary,
  installModel,
  installVadModel,
} from "./install.ts"
import {
  IncompatibleBinaryError,
  defaultServerOptions,
  spawnWhisperServer,
} from "./whisper-server.ts"

const recognitionEngineSchema = z.enum(RECOGNITION_ENGINES)
const whisperModelSchema = z.enum(WHISPER_MODELS)
const buildVariantSchema = z.enum(BUILD_VARIANTS)
const ctcDeviceSchema = z.enum(CTC_DEVICES)

const INSTALL_TARGETS = ["binary", "model", "vad", "ctc-model", "all"] as const
const installTargetSchema = z.enum(INSTALL_TARGETS)

type InstallTarget = (typeof INSTALL_TARGETS)[number]

function isInstallTarget(value: string): value is InstallTarget {
  return INSTALL_TARGETS.includes(value as InstallTarget)
}

const installCommand = defineCommand({
  description: `Install whisper.cpp binary and models.

Usage:
  ghost-story install binary [variant]    - Install binary (auto-detects platform if variant not specified)
  ghost-story install model <model>       - Install a whisper model
  ghost-story install vad                 - Install Silero VAD model
  ghost-story install ctc-model [variant] - Install model for CTC alignment (fp32, fp16, or mlx)
  ghost-story install all                 - Install binary, all models, and VAD`,
  args: z.union([
    z.tuple([
      installTargetSchema.describe(
        `What to install: ${INSTALL_TARGETS.join(", ")}`,
      ),
    ]),
    z.tuple([
      installTargetSchema.describe(
        `What to install: ${INSTALL_TARGETS.join(", ")}`,
      ),
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
      device: ctcDeviceSchema
        .default("auto")
        .describe("Device the CTC model will run on"),
      language: z
        .string()
        .optional()
        .describe("Language of the CTC model, for example en or de"),
    }),
    { f: "force", l: "list", d: "device" },
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
      if (target === "ctc-model") {
        console.log("Available CTC models:")
        for (const family of CTC_MODEL_FAMILIES) {
          const languages =
            family === "mms"
              ? "any language"
              : ctcModelLanguages(family).join(", ")
          console.log(`  ${family} (${languages})`)
        }
        return
      }
      console.error("Use --list with 'binary', 'model', or 'ctc-model'")
      process.exit(1)
    }

    if (!isInstallTarget(target)) {
      console.error(`Unknown install target: ${target as string}`)
      console.error(`Valid targets: ${INSTALL_TARGETS.join(", ")}`)
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

      if (target === "ctc-model") {
        const family = argument ?? "mms"
        if (!isCtcModelFamily(family)) {
          console.error(`Unknown CTC model: ${family}`)
          console.error("\nAvailable models:")
          for (const f of CTC_MODEL_FAMILIES) {
            console.log(`  ${f}`)
          }
          process.exit(1)
        }
        const device = resolveCtcDevice(options.device, null)
        const variant = resolveCtcModelVariant(family, options.language, device)
        await installModelPackage(CTC_MODEL_PACKAGES[variant], {
          force,
          printOutput: true,
        })
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
    error: (issue) => {
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

const serveCommand = defineCommand({
  description:
    "Start a server that computes CTC emissions, and optionally transcribes, for other machines",
  options: defineOptions(
    z.object({
      host: z.string().default("0.0.0.0").describe("Host to bind to"),
      port: z.coerce.number().default(8765).describe("Port to listen on"),
      apiKey: z
        .string()
        .optional()
        .describe(
          "The key clients must send, defaults to GHOST_STORY_API_KEY. Required.",
        ),
      device: ctcDeviceSchema
        .default("auto")
        .describe("Device to run inference on"),
      modelDir: z
        .string()
        .optional()
        .describe("Directory CTC models are installed to"),
      batchSize: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "How many chunks go through the model at once. Defaults to 2 on a GPU and 1 on a CPU. Only really important if time per chunk is already very short, <1s.",
        ),
      concurrency: z.coerce
        .number()
        .optional()
        .describe("How many blocks of audio ffmpeg decodes at once"),
      ffmpeg: z.string().default("ffmpeg").describe("Path to ffmpeg"),
      ffprobe: z.string().default("ffprobe").describe("Path to ffprobe"),
      cacheSize: z.coerce
        .number()
        .positive()
        .default(10)
        .describe("Gigabytes of uploaded audio to keep for later jobs"),
      whisperModel: whisperModelSchema
        .optional()
        .describe(
          "Transcribe with this whisper model at /v1/audio/transcriptions. Omit to serve emissions only.",
        ),
      threads: z.coerce
        .number()
        .default(defaultServerOptions.threads)
        .describe("Threads per whisper processor"),
      processors: z.coerce
        .number()
        .default(defaultServerOptions.processors)
        .describe("Parts whisper splits long audio into"),
    }),
    { p: "port", d: "device", m: "whisper-model" },
  ),
  action: async (options) => {
    const apiKey = options.apiKey ?? process.env["GHOST_STORY_API_KEY"]
    if (!apiKey) {
      const { randomBytes } = await import("node:crypto")
      console.error(
        `The server needs an API key. Pass --api-key or set GHOST_STORY_API_KEY, for example:\n\n  ghost-story serve --api-key ${randomBytes(24).toString("base64url")}\n\nThen enter the same key in Storyteller.`,
      )
      process.exit(1)
    }

    const { execFile } = await import("node:child_process")
    const { promisify } = await import("node:util")
    for (const tool of [options.ffmpeg, options.ffprobe]) {
      try {
        await promisify(execFile)(tool, ["-version"])
      } catch {
        console.error(
          `Could not run ${tool}. Install ffmpeg and put it on your PATH, or pass --ffmpeg and --ffprobe.`,
        )
        process.exit(1)
      }
    }

    let server: typeof import("../server/index.ts")
    try {
      server = await import("../server/index.ts")
    } catch (error) {
      console.error("Failed to load the inference runtime:", error)
      if (process.platform === "win32") {
        console.error(
          "\nOn Windows this usually means the Microsoft Visual C++ Redistributable is missing. Install the x64 or arm64 build from https://aka.ms/vs/17/release/vc_redist.x64.exe (or vc_redist.arm64.exe) and try again.",
        )
      }
      process.exit(1)
    }

    if (options.whisperModel) {
      console.log(`Installing whisper.cpp and ${options.whisperModel}...`)
      await installBinary({ printOutput: true })
      await installModel({ model: options.whisperModel, printOutput: true })
    }

    const jobs = server.memoryJobs()
    const files = await server.diskFileStore({
      maxBytes: options.cacheSize * 1024 ** 3,
    })
    const inference = new PQueue({ concurrency: 1 })
    const log = (message: string) => {
      console.log(`[${new Date().toISOString()}] ${message}`)
    }
    const emissions = server.emissionService({
      jobs,
      files,
      inference,
      device: options.device,
      batchSize: options.batchSize,
      buildVariant: getInstalledVariant(),
      modelDir: options.modelDir,
      concurrency: options.concurrency,
      ffmpegPath: options.ffmpeg,
      ffprobePath: options.ffprobe,
      log,
    })
    const services = [
      emissions,
      ...(options.whisperModel
        ? [
            server.transcriptionService({
              model: options.whisperModel,
              threads: options.threads,
              processors: options.processors,
              inference,
              log,
            }),
          ]
        : []),
    ]
    const listening = await server.listen(
      server.createServer({ services, files, apiKey }),
      { host: options.host, port: options.port },
    )
    console.log("ghost-story server")
    console.log(
      `  Services: ${services.map((service) => service.name).join(", ")}`,
    )
    console.log(`  Device: ${emissions.capabilities().device}`)
    if (options.whisperModel) {
      console.log(`  Whisper model: ${options.whisperModel}`)
    }
    console.log(`  Listening on http://${options.host}:${options.port}`)

    let closing = false
    const shutdown = () => {
      if (closing) return
      closing = true
      console.log("\nShutting down...")
      listening.close()
      void jobs[Symbol.asyncDispose]()
        .then(() =>
          Promise.all(
            services.map((service) => service[Symbol.asyncDispose]()),
          ),
        )
        .then(() => files[Symbol.asyncDispose]())
        .finally(() => process.exit(0))
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
    process.on("SIGBREAK", shutdown)
  },
})

const vadCommand = defineCommand({
  description: "Run voice activity detection on an audio file",
  args: z.tuple([z.string().describe("Input audio file path")], {
    error: (issue) => {
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
    version: packageJson.version,
    description: `Speech toolkit for Storyteller (whisper.cpp v${WHISPER_CPP_VERSION})`,
  },
  commands: {
    install: installCommand,
    status: statusCommand,
    transcribe: transcribeCommand,
    server: serverCommand,
    serve: serveCommand,
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
