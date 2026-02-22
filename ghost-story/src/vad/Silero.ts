/* eslint-disable no-console */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"

import { ensureDir } from "fs-extra"

import {
  getInstallDir,
  getModelDir,
  getVadExecutablePath,
  getVadModelPath,
} from "../cli/config.ts"
import { installBinary, installVadModel } from "../cli/install.ts"
import type { Timeline } from "../utilities/Timeline.ts"

export interface SileroOptions {
  modelDir?: string
  installDir?: string
  printOutput?: boolean
  autoInstall?: boolean
  threshold?: number
  minSpeechDurationMs?: number
  minSilenceDurationMs?: number
  speechPadMs?: number
}

const defaultOptions: Required<
  Pick<
    SileroOptions,
    | "printOutput"
    | "autoInstall"
    | "threshold"
    | "minSpeechDurationMs"
    | "minSilenceDurationMs"
    | "speechPadMs"
  >
> = {
  printOutput: false,
  autoInstall: true,
  threshold: 0.5,
  minSpeechDurationMs: 250,
  minSilenceDurationMs: 100,
  speechPadMs: 30,
}

export interface VadSegment {
  startTime: number
  endTime: number
  isSpeech: boolean
}

export async function ensureVadInstalled(options: SileroOptions = {}): Promise<{
  installDir: string
  vadModelPath: string
}> {
  const opts = { ...defaultOptions, ...options }
  const modelDir = opts.modelDir ?? getModelDir()
  const installDir = opts.installDir ?? getInstallDir()

  await ensureDir(modelDir)

  if (opts.autoInstall) {
    await installBinary({ printOutput: opts.printOutput })
    await installVadModel({ modelDir, printOutput: opts.printOutput })
  }

  const vadModelPath = getVadModelPath(modelDir)

  if (!existsSync(vadModelPath)) {
    throw new Error(
      `VAD model not found at ${vadModelPath}. Run 'ghost-story install --vad' to install.`,
    )
  }

  return { installDir, vadModelPath }
}

export async function detectVoiceActivity(
  inputPath: string,
  options: SileroOptions = {},
): Promise<VadSegment[]> {
  const opts = { ...defaultOptions, ...options }

  if (!existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`)
  }

  const { installDir, vadModelPath } = await ensureVadInstalled(opts)
  const executablePath = getVadExecutablePath(installDir)

  if (!existsSync(executablePath)) {
    throw new Error(
      `VAD executable not found at ${executablePath}. Run 'ghost-story install binary' to install.`,
    )
  }

  const pathToInput = inputPath

  // if audio not .wav, convert to .wav
  // if (!inputPath.endsWith(".wav")) {
  //   pathToInput = await fileToWav(inputPath)
  // }

  const args = [
    "-f",
    pathToInput,
    "-vm",
    vadModelPath,
    "-vt",
    String(opts.threshold),
    // vspd is not supported for some reason
    // "-vspd",
    // String(opts.minSpeechDurationMs),
    "-vsd",
    String(opts.minSilenceDurationMs),
    "-vp",
    String(opts.speechPadMs),
  ]

  // if (!opts.printOutput) {
  //   args.push("-np")
  // }

  if (opts.printOutput) {
    console.log(`Running VAD: ${executablePath} ${args.join(" ")}`)
  }

  const segments = await runVadProcess(
    executablePath,
    args,
    installDir,
    opts.printOutput,
  )

  return segments
}

async function runVadProcess(
  executable: string,
  args: string[],
  cwd: string,
  printOutput: boolean,
): Promise<VadSegment[]> {
  if (printOutput) {
    console.log(`Running VAD: ${executable} ${args.join(" ")}`)
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { cwd })
    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      const str = data.toString("utf-8")
      stdout += str
      if (printOutput) {
        process.stdout.write(data)
      }
    })

    proc.stderr.on("data", (data: Buffer) => {
      const str = data.toString("utf-8")
      stderr += str
      if (printOutput) {
        process.stderr.write(data)
      }
    })

    proc.on("exit", (code, signal) => {
      if (printOutput) {
        console.log(`VAD process exited with code ${code} and signal ${signal}`)
      }
      const segments = parseVadOutput(stdout + stderr)
      if (printOutput) {
        console.log(segments)
      }

      if (code !== 0 && segments.length === 0) {
        reject(
          new Error(
            `VAD process exited with code ${code}: ${stderr || stdout}`,
          ),
        )
        return
      }

      resolve(segments)
    })

    proc.on("error", (err) => {
      if (printOutput) {
        console.error(err)
      }
      reject(new Error(`Failed to start VAD process: ${err.message}`))
    })
  })
}

function parseVadOutput(output: string): VadSegment[] {
  const segments: VadSegment[] = []

  // parse whisper.cpp vad output format:
  // "Speech segment 20: start = 7008.00, end = 7010.00"
  const segmentRegex =
    /Speech segment (\d+): start = (\d+\.\d+), end = (\d+\.\d+)/g

  let match
  while ((match = segmentRegex.exec(output)) !== null) {
    if (!match[2] || !match[3]) {
      throw new Error(`Invalid segment format: ${match[0]}`)
    }
    const startTime = parseFloat(match[2])
    const endTime = parseFloat(match[3])

    segments.push({
      startTime,
      endTime,
      isSpeech: true,
    })
  }

  return segments
}

export function segmentsToTimeline(segments: VadSegment[]): Timeline {
  return segments.map((seg) => ({
    type: "segment" as const,
    text: seg.isSpeech ? "speech" : "silence",
    startTime: seg.startTime,
    endTime: seg.endTime,
  }))
}
