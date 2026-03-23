import assert from "node:assert"

import { chain, enumerate, every, find, map, range } from "itertools"

export type OpType = "MATCH" | "INSERT" | "DELETE" | "SUBSTITUTE"
export const OP_TYPES = [
  "MATCH",
  "INSERT",
  "DELETE",
  "SUBSTITUTE",
] as const satisfies OpType[]

export type Slice = [number, number]

/** Class representing an operation with its type and cost. */
export class Alignment {
  constructor(
    public opType: OpType,
    public refSlice: Slice | null = null,
    public hypSlice: Slice | null = null,
    public ref: string | null = null,
    public hyp: string | null = null,
    public leftCompound = false,
    public rightCompound = false,
  ) {
    switch (opType) {
      case "MATCH": {
        if (ref === null || hyp === null) {
          throw new TypeError("MATCH operation must have non-empty ref or hyp.")
        }
        if (leftCompound || rightCompound) {
          throw new TypeError("MATCH operation cannot have compound markers.")
        }
        break
      }
      case "INSERT": {
        if (hyp === null || ref !== null) {
          throw new TypeError(
            "INSERT operation must have non-empty hyp and empty ref.",
          )
        }
        break
      }
      case "DELETE": {
        if (hyp !== null || ref === null) {
          throw new TypeError(
            "DELETE operation must have non-empty ref and empty hyp.",
          )
        }
        break
      }
      case "SUBSTITUTE": {
        if (ref === null || hyp === null) {
          throw new TypeError(
            "SUBSTITUTE operation must have both ref and hyp.",
          )
        }
      }
    }
  }

  /** Return the hypothesis with compound markers if applicable. */
  get hypWithCompoundMarkers() {
    if (this.hyp === null) {
      return null
    }
    return `${this.leftCompound ? "-" : ""}"${this.hyp}"${this.rightCompound ? "-" : ""}`
  }

  toString() {
    switch (this.opType) {
      case "DELETE": {
        return `Alignment(${this.opType}: "${this.ref}")`
      }
      case "INSERT": {
        return `Alignment(${this.opType}: ${this.hypWithCompoundMarkers})`
      }
      case "SUBSTITUTE": {
        return `Alignment(${this.opType}: ${this.hypWithCompoundMarkers} -> "${this.ref}")`
      }
      case "MATCH": {
        return `Alignment(${this.opType}: "${this.hyp}" == "${this.ref}")`
      }
    }
  }
}

/**
 * Generate all possible combinations of operation types, except the empty set.
 *
 * @returns All possible combinations of operation types.
 */
export function opTypePowerset() {
  const opCombinations = map(range(1, OP_TYPES.length + 1), (r) =>
    combinations(OP_TYPES, r),
  )
  return chain(...opCombinations)
}

function* combinations<T>(iterable: Iterable<T>, r: number) {
  const pool = Array.from(iterable)
  const n = pool.length
  if (r > n) {
    return
  }
  const indices = Array.from(range(r))

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  yield indices.map((i) => pool[i]!)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    let i
    find: {
      for (i of reversed(range(r))) {
        if (indices[i] !== i + n - r) {
          break find
        }
      }
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    indices[i]! += 1
    for (const j of range(i + 1, r)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      indices[j] = indices[j - 1]! + 1
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    yield indices.map((i) => pool[i]!)
  }
}

export function reversed<T>(iterable: IterableIterator<T>) {
  return Array.from(iterable).toReversed()
}

export const START_DELIMITER = "<"
export const END_DELIMITER = ">"
export const DELIMITERS = new Set([START_DELIMITER, END_DELIMITER])

export const OP_TYPE_MAP = OP_TYPES.reduce(
  (acc, opType) => ({ ...acc, [opType]: opType }),
  {} as { [opType in OpType]: opType },
)
export const OP_TYPE_COMBO_MAP = Array.from(enumerate(opTypePowerset())).reduce<
  Record<number, OpType[]>
>((acc, [i, opTypes]) => ({ ...acc, [i]: opTypes }), {})
export function getOpTypeComboIndex(ops: OpType[]): number {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return find(
    enumerate(opTypePowerset()),
    ([_i, set]) =>
      set.length === ops.length &&
      every(range(set.length), (i) => set[i] === ops[i]),
  )![0]
}

export const NUMERIC_TOKEN = "\\p{N}+([,.]\\p{N}+)*(?=\\s|$)"
export const STANDARD_TOKEN = "[\\p{L}\\p{N}]+(['][\\p{L}\\p{N}]+)*'?"

/**
 * Check if the normalized character is a vowel.
 *
 * @param c The character to check.
 * @returns True if the character is a vowel, false, otherwise.
 */
export function isVowel(c: string): boolean {
  assert(c.length === 1, "Input must be a single character")
  return "aeiouy".includes(c)
}

/**
 * Check if the normalized character is a consonant.
 *
 * @param c The character to check.
 * @returns True if the character is a consonant, false, otherwise.
 */
export function isConsonant(c: string): boolean {
  assert(c.length === 1, "Input must be a single character")
  return "bcdfghjklmnpqrstvwxyz".includes(c)
}

/**
 * Categorize a character as 'vowel', 'consonant', or 'unvoiced'.
 *
 * @param c The character to check.
 * @returns The category of the character.
 */
export function categorizeChar(c: string): number {
  if (DELIMITERS.has(c)) return 0
  if (isConsonant(c)) return 1
  if (isVowel(c)) return 2
  return 3 // NOTE: Unvoiced characters (only apostrophes are expected by default)
}

/**
 * Default tokenizer that splits text into words based on whitespace.
 *
 * @param text The input text to tokenize.
 * @returns A list of tokens (words).
 */
export function basicTokenizer(text: string): RegExpMatchArray[] {
  return Array.from(
    text.matchAll(new RegExp(`(${NUMERIC_TOKEN}|${STANDARD_TOKEN})`, "udg")),
  )
}

/**
 * Default normalizer that only converts text to lowercase.
 *
 * @param text The input text to normalize.
 * @returns The normalized text.
 */
export function basicNormalizer(text: string): string {
  return text.toLowerCase()
}

/**
 * Decorator to ensure that the normalizer preserves the length of the input text.
 *
 * @param normalizer The normalizer function to wrap.
 * @returns The wrapped normalizer that preserves length.
 */
export function ensureLengthPreservation<Args extends unknown[]>(
  normalizer: (text: string, ...args: Args) => string,
): (text: string, ...args: Args) => string {
  return function wrapper(text: string, ...args: Args) {
    const normalized = normalizer(text, ...args)
    if (normalized.length !== text.length) {
      throw new RangeError("Normalizer must preserve length.")
    }
    return normalized
  }
}

/**
 * Unpack a regex match array to extract the matched string.
 *
 * @param tokenizer A function to tokenize the sequences. Must be regex-based and return match arrays.
 * @returns A function that unpacks a list of match arrays into tuples (match string, span).
 */
export function unpackRegexMatch<Args extends unknown[]>(
  tokenizer: (text: string, ...args: Args) => RegExpMatchArray[],
): (text: string, ...args: Args) => [string, [number, number]][] {
  return function wrapper(
    text: string,
    ...args: Args
  ): [string, [number, number]][] {
    const matches = tokenizer(text, ...args)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return matches.map((match) => [match[1]!, match.indices![1]!])
  }
}

/**
 * Translate a slice from the alignment sequenc back to the original sequenc.
 *
 * @param segmentSlice The slice in the alignment sequence
 * @param indexMap The mapping from alignment indices to original sequence indices.
 * @returns The translated slice in the original sequence, or None if no valid indices.
 */
export function translateSlice(
  segmentSlice: Slice,
  indexMap: number[],
): Slice | null {
  const sliceIndices = indexMap.slice(...segmentSlice).filter((x) => x >= 0)
  if (sliceIndices.length === 0) {
    return null
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return [sliceIndices[0]!, sliceIndices.at(-1)! + 1] as const
}

export class Counter<T> {
  private counts = new Map<T, number>()

  constructor(init: Iterable<T> | Map<T, number> = []) {
    if (init instanceof Map) {
      this.counts = init
      return
    }
    for (const element of init) {
      this.counts.set(element, (this.counts.get(element) ?? 0) + 1)
    }
  }

  elements() {
    return this.counts
      .entries()
      .flatMap(([e, c]) => Array.from(range(c)).map(() => e))
  }

  mostCommon(n?: number) {
    const ordered = Array.from(this.counts.entries()).toSorted(
      ([_a, a], [_b, b]) => a - b,
    )
    if (n === undefined) return ordered
    return ordered.slice(0, n)
  }

  total() {
    return this.counts.values().reduce((acc, v) => acc + v)
  }

  subtract(update: Iterable<T> | Map<T, number>) {
    if (update instanceof Map) {
      for (const [element, count] of update.entries()) {
        this.counts.set(element, (this.counts.get(element) ?? 0) - count)
      }
      return
    }
    for (const element of update) {
      this.counts.set(element, (this.counts.get(element) ?? 0) - 1)
    }
  }

  update(update: Iterable<T> | Map<T, number>) {
    if (update instanceof Map) {
      for (const [element, count] of update.entries()) {
        this.counts.set(element, (this.counts.get(element) ?? 0) + count)
      }
      return
    }
    for (const element of update) {
      this.counts.set(element, (this.counts.get(element) ?? 0) + 1)
    }
  }

  get(element: T) {
    return this.counts.get(element) ?? 0
  }

  set(element: T, count: number) {
    this.counts.set(element, count)
  }
}
