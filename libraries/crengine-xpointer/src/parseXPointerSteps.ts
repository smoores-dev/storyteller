import { crengineAtoi } from "./crengineAtoi.ts"
import type { XPointerStep } from "./steps.ts"

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9"
}

/** A step, plus the offset of the first character after it. */
type ParsedStep = { readonly step: XPointerStep; readonly pos: number }

/**
 * Split a crengine "xpointer" path into its steps.
 *
 * The grammar, as implemented by `ParseXPathStep` (lvtinydom.cpp:9973) and the loops that
 * drive it (lvtinydom.cpp:11440 and :11345):
 *
 * ```
 * path  := step*
 * step  := '/' ( name index? | 'text()' index? | digits+ ) | '.' digits+
 * index := '[' digits+ ']'
 * name  := [^/.\[]+            # matched literally, against the local element name
 * ```
 *
 * A `.N` step is only accepted as the final step; crengine reaches the same verdict by
 * parsing it and then refusing the leftover input.
 *
 * Returns `null` for a malformed path, as crengine does for anything it cannot parse.
 * The `#id` form is not part of the path grammar and is not accepted here — see
 * {@link resolveXPointer}.
 */
export function parseXPointerSteps(path: string): XPointerStep[] | null {
  const steps: XPointerStep[] = []
  let pos = 0
  while (pos < path.length) {
    const parsed = parseStep(path, pos)
    if (parsed === null) return null
    steps.push(parsed.step)
    pos = parsed.pos
  }
  return steps
}

/**
 * One step of `path`, starting at the `pos` prefix character.
 *
 * A direct port of `ParseXPathStep`; it returns `null` wherever that function returns
 * `xpath_step_error`, including the `index` range checks it performs there (only the
 * `/N` and `.N` forms are range-checked — a bracketed index of `[0]` parses, and simply
 * never matches).
 */
function parseStep(path: string, pos: number): ParsedStep | null {
  const prefix = path[pos]
  const isPoint = prefix === "."
  if (!isPoint && prefix !== "/") return null
  pos++

  const start = pos
  if (isDigit(path[pos])) {
    // A node index (`/N`) or a point (`.N`).
    while (isDigit(path[pos])) pos++
    const next = path[pos]
    if (next !== undefined && next !== "/" && next !== ".") return null
    const index = crengineAtoi(path.slice(start, pos))
    if (isPoint ? index < 0 : index < 1) return null
    // crengine parses the point and then rejects the leftover input (lvtinydom.cpp:11417).
    if (isPoint && next !== undefined) return null
    return {
      step: isPoint
        ? { kind: "offset", offset: index }
        : { kind: "child", index },
      pos,
    }
  }

  while (
    pos < path.length &&
    path[pos] !== "[" &&
    path[pos] !== "/" &&
    path[pos] !== "."
  )
    pos++
  if (pos === start) return null
  const name = path.slice(start, pos)

  let index = -1
  if (path[pos] === "[") {
    pos++
    const indexStart = pos
    while (
      pos < path.length &&
      path[pos] !== "]" &&
      path[pos] !== "/" &&
      path[pos] !== "."
    )
      pos++
    if (pos === path.length || pos === indexStart) return null
    index = crengineAtoi(path.slice(indexStart, pos))
    // crengine advances past whatever ended the scan without checking that it was `]`, so
    // `/p[2/` and `/p[2.` parse as `p[2]` while `/p[2` is an error.
    pos++
  }

  const next = path[pos]
  if (next !== undefined && next !== "/" && next !== ".") return null

  const step: XPointerStep =
    name === "text()"
      ? { kind: "text", index }
      : { kind: "element", name, index }
  return { step, pos }
}
