/* eslint-disable no-console */

import { spawn } from "node:child_process"
import { chmodSync, existsSync, statSync } from "node:fs"

import {
  type BuildVariant,
  type WhisperModel,
  getInstallDir,
  getInstalledVariant,
  getModelPath,
  getWhisperServerExecutablePath,
  isVariantCompatibleWithCurrentPlatform,
} from "./config.ts"
import { installBinary, installModel } from "./install.ts"

export interface ServerOptions {
  model: WhisperModel
  port: number
  host: string
  threads: number
  processors: number
  convert: boolean
  autoInstall: boolean
  variant?: BuildVariant | undefined
  force?: boolean | undefined
  vadModelPath?: string | undefined
  vadThreshold?: number | undefined
}

export const defaultServerOptions: ServerOptions = {
  model: "tiny.en",
  port: 8080,
  host: "0.0.0.0",
  threads: 4,
  processors: 4,
  convert: true,
  autoInstall: true,
}

export class IncompatibleBinaryError extends Error {
  constructor(public readonly installedVariant: BuildVariant) {
    super(
      `Installed binary "${installedVariant}" is not compatible with the current platform. ` +
        `Reinstall with a compatible variant or use --force to attempt running anyway.`,
    )
    this.name = "IncompatibleBinaryError"
  }
}

export async function spawnWhisperServer(options: ServerOptions) {
  const installedVariant = getInstalledVariant()

  if (installedVariant && !options.force) {
    if (!isVariantCompatibleWithCurrentPlatform(installedVariant)) {
      throw new IncompatibleBinaryError(installedVariant)
    }
  }

  const installDir = options.variant
    ? getInstallDir(options.variant)
    : getInstallDir()
  const modelPath = getModelPath(options.model)

  console.log("Setting up whisper.cpp server...")
  console.log(`  Model: ${options.model}`)
  console.log(`  Port: ${options.port}`)
  console.log(`  Host: ${options.host}`)
  console.log(`  Threads: ${options.threads}`)
  console.log(`  Processors: ${options.processors}`)
  if (installedVariant) {
    console.log(`  Variant: ${installedVariant}`)
  }
  console.log("")

  const serverPath = getWhisperServerExecutablePath(installDir)

  if (options.autoInstall) {
    if (!existsSync(serverPath)) {
      console.log("Installing whisper.cpp binary...")
      await installBinary({
        variant: options.variant,
        printOutput: true,
        force: options.force,
      })
      console.log("")
    }

    if (existsSync(serverPath) && !(statSync(serverPath).mode & 0o111)) {
      console.log("Making whisper.cpp binary executable...")
      chmodSync(serverPath, 0o755)
    }

    if (!existsSync(modelPath)) {
      console.log(`Installing model ${options.model}...`)
      await installModel({ model: options.model, printOutput: true })
      console.log("")
    }
  }

  if (!existsSync(serverPath)) {
    console.error(`Server executable not found at ${serverPath}`)
    console.error("Run 'ghost-story install binary' to install whisper.cpp")
    process.exit(1)
  }

  if (!existsSync(modelPath)) {
    console.error(`Model not found at ${modelPath}`)
    console.error(
      `Run 'ghost-story install model ${options.model}' to install the model`,
    )
    process.exit(1)
  }

  console.log("Starting whisper server...")
  console.log(`  Executable: ${serverPath}`)
  console.log(`  Model: ${modelPath}`)
  console.log("")

  const serverArgs = [
    "-m",
    modelPath,
    "--host",
    options.host,
    "--port",
    String(options.port),
    "-t",
    String(options.threads),
    "-p",
    String(options.processors),
    "--inference-path",
    "/audio/transcriptions",
    "--suppress-nst",
    "--flash-attn",
  ]

  if (options.convert) {
    serverArgs.push("--convert")
  }

  if (options.vadModelPath) {
    serverArgs.push("--vad", "--vad-model", options.vadModelPath)
    if (options.vadThreshold !== undefined) {
      serverArgs.push("--vad-threshold", String(options.vadThreshold))
    }
  }

  try {
    const server = spawn(serverPath, serverArgs, {
      stdio: "inherit",
      cwd: installDir,
    })

    server.on("error", (err) => {
      console.error("Failed to start server:", err.message)
      if (err.message.includes("ENOEXEC")) {
        const variant = getInstalledVariant()
        console.error(
          `The installed binary${variant ? ` (${variant})` : ""} cannot be executed on this platform.`,
        )
        console.error(
          "Reinstall with a compatible variant: ghost-story install binary --force",
        )
      }
      process.exit(1)
    })

    server.on("exit", (code, signal) => {
      if (signal) {
        console.log(`Server terminated by signal: ${signal}`)
      } else {
        console.log(`Server exited with code: ${code}`)
      }
    })

    process.on("SIGINT", () => {
      console.log("\nShutting down server...")
      server.kill("SIGTERM")
    })

    process.on("SIGTERM", () => {
      server.kill("SIGTERM")
    })

    return server
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}
