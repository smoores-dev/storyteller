#!/usr/bin/env tsx
/* eslint-disable no-console */

import { execSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { z } from "zod"

import { documentedServerEnvVars } from "../src/envSchema"

const START_MARKER = "<!-- AUTO-GENERATED-ENV-VARS-START -->"
const END_MARKER = "<!-- AUTO-GENERATED-ENV-VARS-END -->"

type EnvVar = {
  name: string
  description: string
  default: string
}

function getDefaultValue(schema: z.ZodType): string {
  if (schema instanceof z.ZodDefault) {
    const defaultValueOrFn = schema.def.defaultValue
    const defaultValue =
      typeof defaultValueOrFn === "function"
        ? (defaultValueOrFn as () => unknown)()
        : defaultValueOrFn
    if (typeof defaultValue === "string") {
      return `\`${defaultValue}\``
    }
    if (typeof defaultValue === "number") {
      return `\`${defaultValue}\``
    }
    return "-"
  }

  if (schema instanceof z.ZodOptional) {
    return "N/A"
  }

  return "N/A"
}

function extractEnvVars(): EnvVar[] {
  const envVars: EnvVar[] = []

  for (const [name, schema] of Object.entries(documentedServerEnvVars)) {
    let description = schema.description || ""

    let unwrapped = schema as z.ZodType
    while (
      unwrapped instanceof z.ZodOptional ||
      unwrapped instanceof z.ZodDefault
    ) {
      if (unwrapped instanceof z.ZodOptional) {
        unwrapped = (unwrapped as z.ZodOptional<z.ZodType>).unwrap()
      }
      if (unwrapped instanceof z.ZodDefault) {
        unwrapped = (unwrapped as z.ZodDefault<z.ZodType>).def.innerType
      }
    }

    if (unwrapped.description) {
      description = unwrapped.description
    }

    let defaultValue = getDefaultValue(schema)

    if (description.includes("|")) {
      const parts = description.split("|")
      description = parts[0]?.trim() ?? ""
      defaultValue = parts[1]?.trim() ?? ""
    }

    envVars.push({ name, description, default: defaultValue })
  }

  return envVars.sort((a, b) => a.name.localeCompare(b.name))
}

function generateTable(envVars: EnvVar[]): string {
  const rows = envVars.map(
    (v) => `| ${v.name} | ${v.description} | ${v.default} |`,
  )

  return [
    "| Variable Name | Description | Default |",
    "| ------------- | ----------- | ------- |",
    ...rows,
  ].join("\n")
}

async function main() {
  const isCheck = process.argv.includes("--check")

  const docsPath = join(process.cwd(), "docs/docs/installation/self-hosting.md")

  const currentContent = await readFile(docsPath, "utf-8")

  const envVars = extractEnvVars()
  const newTable = generateTable(envVars)

  const startIndex = currentContent.indexOf(START_MARKER)
  const endIndex = currentContent.indexOf(END_MARKER)

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(
      "could not find auto-generated markers in self-hosting.md. add markers around the table.",
    )
  }

  const before = currentContent.slice(0, startIndex + START_MARKER.length)
  const after = currentContent.slice(endIndex)
  const newContent = `${before}\n\n${newTable}\n\n${after}`

  if (isCheck) {
    let tmpDir: string | null = null
    try {
      await writeFile(docsPath, newContent, "utf-8")
      execSync(`yarn prettier --write ${docsPath}`, { stdio: "pipe" })
      const formattedNewContent = await readFile(docsPath, "utf-8")

      if (formattedNewContent !== currentContent) {
        tmpDir = await mkdtemp(join(tmpdir(), "env-docs-"))
        const currentFile = join(tmpDir, "current.md")
        const newFile = join(tmpDir, "new.md")
        await writeFile(currentFile, currentContent, "utf-8")
        await writeFile(newFile, formattedNewContent, "utf-8")

        console.error(
          "error: environment variables table is out of date. run 'yarn generate:env-docs' to update it.\n",
        )

        try {
          const diff = execSync(`diff -u ${currentFile} ${newFile}`, {
            encoding: "utf-8",
          })
          console.error(diff)
        } catch (error: unknown) {
          if (error instanceof Error && "stdout" in error) {
            console.error(error.stdout)
          }
        }

        process.exit(1)
      }
      console.log("environment variables table is up to date")
    } finally {
      await writeFile(docsPath, currentContent, "utf-8")
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true })
      }
    }
  } else {
    await writeFile(docsPath, newContent, "utf-8")
    execSync(`yarn prettier --write ${docsPath}`, { stdio: "inherit" })
    console.log("generated environment variables table in self-hosting.md")
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error("error:", error.message)
  } else {
    console.error("error:", error)
  }
  process.exit(1)
})
