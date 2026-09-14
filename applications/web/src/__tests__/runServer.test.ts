import assert from "node:assert"
import { type ChildProcess, execFileSync, spawn } from "node:child_process"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cwd } from "node:process"

import { describe, it } from "vitest"

const SCRIPT = join(cwd(), "..", "..", "docker-scripts", "run-server.sh")

function toolAvailable(command: string, args: string[]) {
  try {
    execFileSync(command, args, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const canRun =
  toolAvailable("bash", ["-c", "[ ${BASH_VERSINFO[0]} -ge 5 ]"]) &&
  toolAvailable("bash", ["-c", "command -v rotatelogs"])

type Run = {
  proc: ChildProcess
  exited: Promise<number | null>
  stdout: () => string
}

function startLauncher(dataDir: string, entry: string): Run {
  const proc = spawn("bash", [SCRIPT, entry], {
    env: { ...process.env, STORYTELLER_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let stdout = ""
  proc.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString()
  })
  proc.stderr.on("data", () => {})

  const exited = new Promise<number | null>((resolve) => {
    proc.on("exit", (code) => {
      resolve(code)
    })
  })

  return { proc, exited, stdout: () => stdout }
}

async function readLogLines(dataDir: string) {
  const [name, ...rest] = await readdir(join(dataDir, "logs"))
  assert.ok(name)
  assert.deepStrictEqual(rest, [])

  const content = await readFile(join(dataDir, "logs", name), "utf-8")
  return content.trim().split("\n")
}

async function setup(childSource: string) {
  const dataDir = await mkdtemp(join(tmpdir(), "st-launcher-"))
  const entry = join(dataDir, "child.mjs")
  await writeFile(entry, childSource)
  return { dataDir, entry }
}

function waitFor(run: Run, text: string) {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (run.stdout().includes(text)) {
        resolve()
      } else {
        setTimeout(check, 20)
      }
    }
    check()
  })
}

describe("run-server.sh", { skip: !canRun }, () => {
  it("captures output to the daily file and records the exit code", async () => {
    const { dataDir, entry } = await setup(`
      process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: "hello" }) + "\\n")
      console.error("FATAL ERROR: something broke")
      process.exit(3)
    `)

    const run = startLauncher(dataDir, entry)
    const code = await run.exited

    assert.strictEqual(code, 3)

    const lines = await readLogLines(dataDir)

    assert.strictEqual(lines.length, 3)
    assert.match(lines[0] ?? "", /"msg":"hello"/)
    assert.strictEqual(lines[1], "FATAL ERROR: something broke")

    const exit = JSON.parse(lines[2] ?? "") as Record<string, unknown>
    assert.strictEqual(exit["level"], 60)
    assert.strictEqual(exit["code"], 3)
    assert.strictEqual(exit["src"], "launcher")
    assert.match(String(exit["msg"]), /exited with code 3/)

    assert.match(run.stdout(), /"msg":"hello"/)
    assert.match(run.stdout(), /exited with code 3/)
  })

  it("records a signal death", async () => {
    const { dataDir, entry } = await setup(`
      process.stdout.write("ready\\n")
      process.kill(process.pid, "SIGSEGV")
    `)

    const run = startLauncher(dataDir, entry)
    const code = await run.exited

    assert.strictEqual(code, 139)

    const lines = await readLogLines(dataDir)
    const exit = JSON.parse(lines.at(-1) ?? "") as Record<string, unknown>

    assert.strictEqual(exit["level"], 60)
    assert.match(String(exit["msg"]), /killed by SIGSEGV/)
  })

  it("forwards SIGTERM and exits cleanly", async () => {
    const { dataDir, entry } = await setup(`
      process.on("SIGTERM", () => {
        process.stdout.write("bye\\n")
        process.exit(0)
      })
      setInterval(() => {}, 1000)
      process.stdout.write("ready\\n")
    `)

    const run = startLauncher(dataDir, entry)
    await waitFor(run, "ready")
    run.proc.kill("SIGTERM")
    const code = await run.exited

    assert.strictEqual(code, 0)

    const lines = await readLogLines(dataDir)

    assert.strictEqual(lines.at(-2), "bye")
    const exit = JSON.parse(lines.at(-1) ?? "") as Record<string, unknown>
    assert.strictEqual(exit["level"], 30)
    assert.match(String(exit["msg"]), /stopped/)
  })
})
