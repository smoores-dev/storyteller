import { range } from "itertools"
import memoize from "memoize"

import { BacktraceGraph, type Index } from "./backtraceGraph.ts"
import { computeErrorAlignDistanceMatrix } from "./editDistance.ts"
import { END_DELIMITER, START_DELIMITER, categorizeChar } from "./utils.ts"

export type TokenWithSpan = [string, [number, number]]

export interface GraphMetadata {
  refRaw: string
  hypRaw: string
  refTokenMatches: TokenWithSpan[]
  hypTokenMatches: TokenWithSpan[]
  refNorm: string[]
  hypNorm: string[]
}

/**
 * Data class to hold information needed for beam search alignment.
 *
 * This data class encapsulates all necessary infomation about a subgraph
 * derived from the reference and hypothesis texts, including their tokenized
 * and normalized forms, as well as derived attributes used during
 * the alignment process.
 *
 * It works as a reference for the `Path` class during beam search alignment.
 */
export class SubgraphMetadata {
  public ref: string
  public hyp: string
  public refMaxIndex: number
  public hypMaxIndex: number
  public refCharTypes: number[]
  public hypCharTypes: number[]
  public refIndexMap: number[]
  public hypIndexMap: number[]
  public backtraceGraph: BacktraceGraph
  public backtraceNodeSet: Set<Index>
  public unambiguousMatches: Set<Index>

  constructor(
    public refRaw: string,
    public hypRaw: string,
    public refTokenMatches: [string, [number, number]][],
    public hypTokenMatches: [string, [number, number]][],
    public refNorm: string[],
    public hypNorm: string[],
  ) {
    this.ref = embedTokens(refNorm)
    this.hyp = embedTokens(hypNorm)
    this.refMaxIndex = this.ref.length - 1
    this.hypMaxIndex = this.hyp.length - 1
    this.refCharTypes = getCharTypes(this.ref)
    this.hypCharTypes = getCharTypes(this.hyp)
    this.refIndexMap = createIndexMap(refTokenMatches)
    this.hypIndexMap = createIndexMap(hypTokenMatches)

    // First pass: Compute backtrace graph.
    const { backtraceMatrix } = computeErrorAlignDistanceMatrix(
      this.ref,
      this.hyp,
      true,
    )
    this.backtraceGraph = new BacktraceGraph(backtraceMatrix)
    // NOTE: Used for backtrace deviation penalty during beam search.
    this.backtraceNodeSet = this.backtraceGraph.getNodeSet()
    // NOTE: Used for beam pruning during beam search.
    this.unambiguousMatches =
      this.backtraceGraph.getUnambiguousTokenSpanMatches(this.ref)
  }
}

/**
 * Embed tokens with delimiters.
 */
function embedTokens(textTokens: string[]): string {
  return textTokens
    .map((t) => `${START_DELIMITER}${t}${END_DELIMITER}`)
    .join("")
}

/**
 * Cached version of categorize_char for performance.
 */
const categorizeCharCached = memoize(function categorizeCharCached(
  c: string,
): number {
  return categorizeChar(c)
})

/**
 * Get character types (0-3) for each character in the text.
 */
function getCharTypes(text: string): number[] {
  return text.split("").map((c) => categorizeCharCached(c))
}

/**
 * Create an index map for the given tokens.
 *
 * The 'index_map' is used to map each aligned character back to its original position in
 * the input text.
 *
 * NOTE: -1 is used for delimiters (<>) and indicates no match in the source sequence.
 */
function createIndexMap(textTokens: TokenWithSpan[]): number[] {
  const indexMap: number[] = []
  for (const [_, span] of textTokens) {
    indexMap.push(-1) // Start delimiter
    indexMap.push(...range(...span))
    indexMap.push(-1) // End delimiter
  }
  return indexMap
}
