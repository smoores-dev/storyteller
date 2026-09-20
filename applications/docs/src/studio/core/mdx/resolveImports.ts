import React from "react"
import * as jsxRuntime from "react/jsx-runtime"

import { dirname, joinPath } from "../config"

import type { CodeImport } from "./plugins/stripEsm"

const CANDIDATE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"]

function candidatePaths(basePath: string): string[] {
  if (/\.[a-z]+$/i.test(basePath)) return [basePath]

  return CANDIDATE_EXTENSIONS.map((ext) => basePath + ext)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModuleExports = Record<string, any>

const KNOWN_MODULES: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "react/jsx-dev-runtime": jsxRuntime,
}

function evaluateModule(code: string): ModuleExports | null {
  try {
    const exports: ModuleExports = {}
    const module = { exports }

    const require = (specifier: string) => {
      if (specifier in KNOWN_MODULES) return KNOWN_MODULES[specifier]

      throw new Error(
        `Import "${specifier}" cannot be resolved in the studio preview. ` +
          "Only self-contained components that depend on React are supported.",
      )
    }

    const fn = new Function("require", "exports", "module", code)
    fn(require, exports, module)

    // handle both module.exports = X and exports.default = X
    if (module.exports !== exports) return { default: module.exports }

    return exports
  } catch {
    return null
  }
}

export async function resolveCodeImports(
  imports: CodeImport[],
  currentFile: string,
  loadFile: (file: string) => Promise<string | null>,
): Promise<Record<string, unknown>> {
  if (imports.length === 0) return {}

  // lazy-load sucrase so the main bundle is not penalised when there
  // are no code imports to resolve
  const { transform } = await import("sucrase")
  const resolved: Record<string, unknown> = {}

  for (const imp of imports) {
    const basePath = joinPath(dirname(currentFile), imp.specifier)
    const candidates = candidatePaths(basePath)

    let source: string | null = null

    for (const candidate of candidates) {
      source = await loadFile(candidate)
      if (source !== null) break
    }

    if (source === null) continue

    let compiled: string

    try {
      compiled = transform(source, {
        transforms: ["typescript", "jsx", "imports"],
        jsxRuntime: "classic",
      }).code
    } catch {
      continue
    }

    const mod = evaluateModule(compiled)
    if (!mod) continue

    if (imp.defaultBinding) {
      resolved[imp.defaultBinding] = mod.default ?? mod
    }

    for (const binding of imp.namedBindings) {
      if (binding.imported in mod) {
        resolved[binding.local] = mod[binding.imported]
      }
    }
  }

  return resolved
}
