import { type ChildProcess, execSync, spawn } from "node:child_process"
import { isAbsolute, join, resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { DATA_DIR } from "@/directories"
import { env } from "@/env"
import { logger } from "@/logging"

export type ReadiumServiceErrorType =
  | "file_not_found"
  | "file_not_found_in_book"
  | "not_running"

export class ReadiumServiceError extends Error {
  errorType: ReadiumServiceErrorType | undefined

  constructor(message: string, errorType?: ReadiumServiceErrorType) {
    super(message)
    this.name = "ReadiumServiceError"
    this.errorType = errorType
  }
}

export interface ReadiumServiceConfig {
  port: number
  maxRetries: number
  healthCheckInterval: number
  startupTimeout: number
}

export class ReadiumService {
  private process: ChildProcess | null = null
  private port: number
  private maxRetries: number
  private healthCheckInterval: number
  private startupTimeout: number
  private healthCheckTimer: NodeJS.Timeout | null = null
  private isShuttingDown = false
  private retryCount = 0

  private processArgs: string[] = []
  constructor(config: ReadiumServiceConfig) {
    this.port = config.port
    this.maxRetries = config.maxRetries
    this.healthCheckInterval = config.healthCheckInterval
    this.startupTimeout = config.startupTimeout

    this.processArgs = [
      "serve",
      "-p",
      this.port.toString(),
      "--file-directory",
      "/",
      ...(env.STORYTELLER_LOG_LEVEL === "debug" ? ["--debug"] : []),
      "--address",
      "localhost",
    ]
  }

  async start(): Promise<void> {
    if (this.process && !this.process.killed) {
      // double-check that it's actually running by doing a health check
      const isHealthy = await this.checkHealth()
      if (isHealthy) {
        logger.info("Readium service is already running")
        return
      } else {
        logger.warn("Process exists but not healthy, cleaning up")
        this.cleanupProcess()
      }
    }

    try {
      await this.startProcess()
      this.startHealthCheck()
      this.retryCount = 0
      logger.info(`Readium service started on port ${this.port}`)
    } catch (error) {
      logger.error({ err: error }, "Failed to start Readium service")
      throw error
    }
  }

  private async startProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Readium service failed to start within ${this.startupTimeout}ms`,
          ),
        )
      }, this.startupTimeout)

      this.process = spawn("readium", this.processArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      })

      if (!this.process.pid) {
        clearTimeout(timeoutId)
        reject(new Error("Failed to spawn Readium process"))
        return
      }

      let hasStarted = false
      this.process.stderr?.on("data", async (data) => {
        const output = Buffer.from(data).toString()
        const matches = parseReadiumOutput(output)
        const level = matches?.level

        if (level === "INFO") {
          logger.info({ msg: `[READIUM] ${matches?.msg ?? output}` })
        } else {
          logger.error({ msg: `[READIUM] ${matches?.msg ?? output}` })
        }

        if (output.includes("address already in use")) {
          // the process has not been killed properly
          logger.warn("Readium process is still running, attempting reuse")
          // find process running on 8002

          const process = findOpenProcessId(
            this.port,
            this.processArgs.join(" "),
          )
          logger.info({ msg: "Readium process", data: process })

          if (!process) {
            throw new Error(
              `No readium process found on port ${this.port}, Manually kill the process running on port ${this.port} and restart the server.`,
            )
          }

          logger.warn(`Killing process ${process}`)

          try {
            execSync(`kill -9 ${process}`)
          } catch (error) {
            logger.error(
              { err: error },
              `Failed to kill existing readium process with PID ${process}`,
            )
            throw error
          }

          try {
            logger.info(
              `Killed old readium process with PID ${process}. Restarting...`,
            )
            await this.start()
          } catch (error) {
            logger.error({ err: error }, "Failed to restart Readium service")
            throw error
          }
        }

        // look for startup message
        if (!hasStarted && output.includes("Starting HTTP server")) {
          hasStarted = true
          clearTimeout(timeoutId)
          logger.info({ msg: "Readium service started", data: output })
          resolve()
        }
      })

      this.process.on("error", (error) => {
        clearTimeout(timeoutId)
        logger.error({ err: error }, "Readium process error")
        reject(error)
      })

      this.process.on("exit", (code, signal) => {
        clearTimeout(timeoutId)
        logger.warn(
          `Readium process exited with code ${code}, signal ${signal}`,
        )
        this.process = null

        if (!this.isShuttingDown && this.retryCount < this.maxRetries) {
          this.retryCount++
          logger.info(
            `Attempting to restart Readium service (attempt ${this.retryCount}/${this.maxRetries})`,
          )
          // wait longer to ensure port is released
          const backoffTime = Math.min(1000 * 2 ** this.retryCount, 10000)
          setTimeout(() => {
            this.start().catch((err: unknown) => {
              logger.error({ err }, "Failed to restart Readium service")
            })
          }, backoffTime)
        }
      })
    })
  }

  private cleanupProcess(): void {
    if (this.process) {
      if (!this.process.killed) {
        this.process.kill("SIGTERM")
      }
      this.process = null
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }

    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) return

      const isHealthy = await this.checkHealth()
      // it might have changed since the last check
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!isHealthy && !this.isShuttingDown) {
        logger.warn("Readium service health check failed, attempting restart")
        this.stop()
        await sleep(1000)
        this.start().catch((err: unknown) => {
          logger.error(
            { err },
            "Failed to restart Readium service after health check failure",
          )
        })
      }
    }, this.healthCheckInterval)
  }

  async checkHealth(): Promise<boolean> {
    if (
      !this.process ||
      this.process.killed ||
      this.process.pid === undefined
    ) {
      return false
    }

    try {
      // check if the server responds to any request (readium doesn't have a health endpoint)
      // we'll just try to access the root path which should return 404 but shows server is responsive
      await fetch(`http://localhost:${this.port}/`, {
        signal: AbortSignal.timeout(3000),
      })

      // readium returns 404 for root path, but that means it's running
      // any response (including 404) means the server is alive
      return true
    } catch (error) {
      // connection refused, timeout, etc. means server is not responsive
      logger.debug({ err: error }, "Readium health check failed")
      return false
    }
  }
  static base64Encode(path: string): string {
    // readium does not like trailing = signs
    // should be base64url specifically, not base64, otherwise fails on some unicode chars
    return Buffer.from(path).toString("base64url").replace(/=+$/, "")
  }

  private static encodePath(filepath: string, assetPath: string): string {
    const fullBookPath = isAbsolute(filepath)
      ? filepath
      : join(DATA_DIR, filepath)

    // resolve the path to the absolute path
    const resolvedPath = resolve(fullBookPath)

    const filePathEncoded = ReadiumService.base64Encode(resolvedPath.slice(1))

    return `/webpub/${filePathEncoded}/${assetPath}`
  }

  async makeRequest(
    /**
     * the path of the book file, ideally absolute
     */
    filepath: string,
    /**
     * the path of the asset within the book, eg `manifest.json`
     */
    assetPath: string,
    searchParams?: URLSearchParams,
    init?: RequestInit,
  ): Promise<Response> {
    if (!this.process || this.process.killed) {
      throw new ReadiumServiceError(
        "Readium service is not running",
        "not_running",
      )
    }

    const path = ReadiumService.encodePath(filepath, assetPath)

    const url = new URL(path, `http://localhost:${this.port}`)
    if (searchParams) {
      url.search = searchParams.toString()
    }

    logger.debug(`[READIUM] Fetching ${url.toString()}`)
    const response = await fetch(url, init)
    logger.debug(`[READIUM] ${response.status} ${url.toString()}`)

    if (response.status >= 500) {
      const text = await response.clone().text()

      if (
        text.includes("no such file or directory") ||
        text.includes("failed opening file://")
      ) {
        throw new ReadiumServiceError(
          "Book file not found on disk",
          "file_not_found",
        )
      }
    }
    if (response.status === 404) {
      throw new ReadiumServiceError(
        "Resource not found in book",
        "file_not_found_in_book",
      )
    }

    return response
  }

  stop(): void {
    this.isShuttingDown = true

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }

    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM")

      setTimeout(() => {
        if (this.process && !this.process.killed) {
          logger.warn("Force killing Readium process")
          this.process.kill("SIGKILL")
        }
      }, 5_000)
    }

    logger.info("Readium service stopped")
  }

  isRunning(): boolean {
    return (
      this.process !== null &&
      !this.process.killed &&
      this.process.pid !== undefined
    )
  }

  getPort(): number {
    return this.port
  }
}

// we need to put this on `globalThis` otherwise the instance is not shared between
// routes and instrumentation
declare global {
  // need to use var for globalThis
  // eslint-disable-next-line no-var
  var readiumServiceInstance: ReadiumService | null
  // need to use var for globalThis
  // eslint-disable-next-line no-var
  var readiumServiceShutdownHandlersAttached: boolean | undefined
}

export function getReadiumService(): ReadiumService {
  if (!globalThis.readiumServiceInstance) {
    const port = env.READIUM_PORT
    globalThis.readiumServiceInstance = new ReadiumService({
      port,
      maxRetries: 3,
      healthCheckInterval: 30_000,
      startupTimeout: 10_000,
    })
  }

  return globalThis.readiumServiceInstance
}

function stopReadiumServiceForSignal(signal: "SIGINT" | "SIGTERM") {
  if (globalThis.readiumServiceInstance) {
    logger.info(`Received ${signal}, stopping Readium service`)
    globalThis.readiumServiceInstance.stop()
  }

  // ensure we do not trap the process by leaving signal handlers attached
  process.exit(0)
}

if (!globalThis.readiumServiceShutdownHandlersAttached) {
  globalThis.readiumServiceShutdownHandlersAttached = true
  globalThis.process.once("SIGTERM", () => {
    stopReadiumServiceForSignal("SIGTERM")
  })

  globalThis.process.once("SIGINT", () => {
    stopReadiumServiceForSignal("SIGINT")
  })
}

/**
 * Find the process id of the process running on the given port and command
 * Mathches processes by the command and the arg we provide
 *
 * So if a process is running on port 8002 with serve -p 8002 --file-directory / --address localhost
 * we can be pretty damn sure it's the readium process
 */
function findOpenProcessId(port: number, args: string): number | null {
  const exec = execSync(`lsof -i :${port}`, {
    timeout: 5_000,
  })

  // `lsof` typically starts with a header row
  const lines = exec
    .toString()
    .trim()
    .split("\n")
    .filter((line) => !line.startsWith("COMMAND"))

  const pids = lines.map((line) => parseInt(line.split(" ")[1] ?? "0", 10))

  const process = pids.find((pid) =>
    execSync(`ps -ef | grep '${pid}' | grep '${args}'`, {
      timeout: 5_000,
    })
      .toString()
      .includes(args),
  )
  return process ?? null
}

function parseReadiumOutput(
  output: string,
): { date: string; time: string; level: string; msg: string } | null {
  const matches = output.match(
    /^(?<date>[\d/]+)\s(?<time>[\d:]+)\s(?<level>[A-Z]+)\s(?<msg>.*)/,
  )
  return matches?.groups as {
    date: string
    time: string
    level: string
    msg: string
  } | null
}
