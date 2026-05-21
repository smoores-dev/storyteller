import { type UUID } from "@/uuid"

import { type ImportRule } from "./importRules"

export type ValidationError =
  | { ok: false; error: "asset-folder"; conflictWith?: undefined }
  | { ok: false; error: "duplicate"; conflictWith: UUID }
  | { ok: false; error: "parent-of"; conflictWith: UUID }
  | { ok: false; error: "child-of"; conflictWith: UUID }

export type ValidationResult = { ok: true } | ValidationError

export type ValidationInput = {
  path: string
  existingRules: Pick<ImportRule, "uuid" | "kind" | "path">[]
  excludeUuid?: UUID
  // resolved server-side; pass [] from the client.
  forbiddenRoots?: string[]
}

// normalize without touching the filesystem so the same function can run on
// server and client. resolves `.` and `..`, drops empty and trailing
// segments, keeps the leading slash if present.
export function normalizeRulePath(p: string): string {
  const flipped = p.replaceAll("\\", "/")
  const isAbsolute = flipped.startsWith("/")
  const stack: string[] = []
  for (const part of flipped.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") stack.pop()
      else if (!isAbsolute) stack.push("..")
      continue
    }
    stack.push(part)
  }
  return (isAbsolute ? "/" : "") + stack.join("/")
}

function isInsideOrEqual(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(parent + "/")
}

export function validateWatchRulePath(
  input: ValidationInput,
): ValidationResult {
  const candidate = normalizeRulePath(input.path)

  for (const root of input.forbiddenRoots ?? []) {
    const normalized = normalizeRulePath(root)
    if (isInsideOrEqual(normalized, candidate)) {
      return { ok: false, error: "asset-folder" }
    }
  }

  for (const rule of input.existingRules) {
    if (rule.kind !== "watch") continue
    if (rule.uuid === input.excludeUuid) continue

    const other = normalizeRulePath(rule.path)
    if (other === candidate) {
      return { ok: false, error: "duplicate", conflictWith: rule.uuid }
    }
    if (isInsideOrEqual(candidate, other)) {
      // candidate would contain an existing watch rule
      return { ok: false, error: "parent-of", conflictWith: rule.uuid }
    }
    if (isInsideOrEqual(other, candidate)) {
      // candidate sits inside an existing watch rule
      return { ok: false, error: "child-of", conflictWith: rule.uuid }
    }
  }

  return { ok: true }
}

export function watchRuleValidationMessage(
  result: ValidationError,
  context?: { conflictingPath?: string },
): string {
  switch (result.error) {
    case "asset-folder":
      return "Cannot use the internal assets or uploads directory as an import rule path."
    case "duplicate":
      return context?.conflictingPath
        ? `A watch rule already exists for ${context.conflictingPath}.`
        : "A watch rule already exists for this path."
    case "parent-of":
      return context?.conflictingPath
        ? `This path is a parent of an existing watch rule (${context.conflictingPath}).`
        : "This path is a parent of an existing watch rule."
    case "child-of":
      return context?.conflictingPath
        ? `This path is already covered by an existing watch rule (${context.conflictingPath}).`
        : "This path is already covered by an existing watch rule."
  }
}
