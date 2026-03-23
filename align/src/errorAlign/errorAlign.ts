/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { enumerate, range } from "itertools"

import { BacktraceGraph } from "./backtraceGraph.ts"
import { type GraphMetadata, SubgraphMetadata } from "./graphMetadata.ts"
import {
  computeLevenshteinDistanceMatrix,
  errorAlignBeamSearch,
} from "./native.ts"
import { getAlignments } from "./pathToAlignment.ts"
import {
  Alignment,
  type Slice,
  basicNormalizer,
  basicTokenizer,
  ensureLengthPreservation,
  unpackRegexMatch,
} from "./utils.ts"

/**
 * Run error alignment between reference and hypothesis texts.
 *
 * @param ref The reference sequence/transcript.
 * @param hyp The hypothesis sequence/transcript.
 * @param tokenizer A function to tokenize the sequence. Must be regex-based and return Match objects.
 * @param normalizer A function to normalize the tokens. Defaults to basicNormalizer.
 * @param beamSize The beam size for the beam search alignment.
 * @param wordLevelPass Whether to perform a word-level aligment pass to identify unambiguous matches.
 */
export function errorAlign(
  ref: string,
  hyp: string,
  tokenizer = basicTokenizer,
  normalizer = basicNormalizer,
  beamSize = 100,
  wordLevelPass = true,
) {
  const graphMetadata = prepareGraphMetadata(ref, hyp, tokenizer, normalizer)

  if (graphMetadata.refNorm === graphMetadata.hypNorm) {
    return alignIdenticalInputs(graphMetadata)
  }
  if (!wordLevelPass) {
    return alignBeamSearch(graphMetadata, beamSize)
  }
  return alignWithWordLevelPass(graphMetadata, beamSize)
}

function prepareGraphMetadata(
  ref: string,
  hyp: string,
  tokenizer = basicTokenizer,
  normalizer = basicNormalizer,
): GraphMetadata {
  const unpackedTokenizer = unpackRegexMatch(tokenizer)
  const refTokenMatches = unpackedTokenizer(ref)
  const hypTokenMatches = unpackedTokenizer(hyp)

  const ensuredNormalizer = ensureLengthPreservation(normalizer)
  const refNorm = refTokenMatches.map(([r]) => ensuredNormalizer(r))
  const hypNorm = hypTokenMatches.map(([h]) => ensuredNormalizer(h))

  return {
    refRaw: ref,
    hypRaw: hyp,
    refTokenMatches,
    hypTokenMatches,
    refNorm,
    hypNorm,
  }
}

/**
 * Return alignments for identical reference and hypothesis pairs.
 */
function alignIdenticalInputs(graphMetadata: GraphMetadata): Alignment[] {
  const alignments: Alignment[] = []
  for (const i of range(graphMetadata.refTokenMatches.length)) {
    const alignment = getMatchAlignmentFromTokenIndices(graphMetadata, {
      refIndex: i,
      hypIndex: i,
    })
    alignments.push(alignment)
  }

  return alignments
}

/**
 * Perform beam search alignment for the given search.
 */
function alignBeamSearch(
  graphMetadata: GraphMetadata,
  beamSize: number,
  refStart?: number,
  refEnd?: number,
  hypStart?: number,
  hypEnd?: number,
) {
  const src = new SubgraphMetadata(
    graphMetadata.refRaw,
    graphMetadata.hypRaw,
    graphMetadata.refTokenMatches.slice(refStart, refEnd),
    graphMetadata.hypTokenMatches.slice(hypStart, hypEnd),
    graphMetadata.refNorm.slice(refStart, refEnd),
    graphMetadata.hypNorm.slice(hypStart, hypEnd),
  )

  const path = errorAlignBeamSearch(src, beamSize)
  return getAlignments(path)
}

/**
 * Perform a word-level alignment pass to identify unambiguous matches.
 */
function alignWithWordLevelPass(
  graphMetadata: GraphMetadata,
  beamSize: number,
) {
  const { backtraceMatrix } = computeLevenshteinDistanceMatrix(
    graphMetadata.refNorm,
    graphMetadata.hypNorm,
    true,
  )
  const backtraceGraph = new BacktraceGraph(backtraceMatrix)
  const matchIndices = backtraceGraph.getUnambiguousNodeMatches()
  // NOTE: We always add an artificial terminal match node to simplify subspan extraction.
  matchIndices.push([
    graphMetadata.hypNorm.length,
    graphMetadata.refNorm.length,
  ])

  let hypStart = 0
  let refStart = 0
  const alignments: Alignment[] = []
  const endIndex = matchIndices.length - 1

  for (const [i, [hypEnd, refEnd]] of enumerate(matchIndices)) {
    const refIsEmpty = refStart === refEnd
    const hypIsEmpty = hypStart === hypEnd

    // NOTE: Subspans where ref xor hyp is empty are guaranteed to be all INSERT or DELETE ops.
    if (!refIsEmpty && !hypIsEmpty) {
      alignments.push(
        ...alignBeamSearch(
          graphMetadata,
          beamSize,
          refStart,
          refEnd,
          hypStart,
          hypEnd,
        ),
      )
    } else if (refIsEmpty && !hypIsEmpty) {
      for (const tokenIndex of range(hypStart, hypEnd)) {
        alignments.push(
          getInsertAlignmentFromTokenIndex(graphMetadata, tokenIndex),
        )
      }
    } else if (hypIsEmpty && !refIsEmpty) {
      for (const tokenIndex of range(refStart, refEnd)) {
        alignments.push(
          getDeleteAlignmentFromTokenIndex(graphMetadata, tokenIndex),
        )
      }
    }

    if (i < endIndex) {
      alignments.push(
        getMatchAlignmentFromTokenIndices(graphMetadata, {
          refIndex: refEnd,
          hypIndex: hypEnd,
        }),
      )
    }

    refStart = refEnd + 1
    hypStart = hypEnd + 1
  }

  return alignments
}

/**
 * Get a MATCH alignment for the given token indices.
 */
function getMatchAlignmentFromTokenIndices(
  graphMetadata: GraphMetadata,
  { refIndex, hypIndex }: { refIndex: number; hypIndex: number },
) {
  const refSlice: Slice = graphMetadata.refTokenMatches[refIndex]![1]
  const hypSlice: Slice = graphMetadata.hypTokenMatches[hypIndex]![1]

  return new Alignment(
    "MATCH",
    refSlice,
    hypSlice,
    graphMetadata.refRaw.slice(...refSlice),
    graphMetadata.hypRaw.slice(...hypSlice),
  )
}

/**
 * Get an INSERT alignment for the given token index.
 */
function getInsertAlignmentFromTokenIndex(
  graphMetadata: GraphMetadata,
  hypIndex: number,
) {
  const slice = graphMetadata.hypTokenMatches[hypIndex]![1]
  const token = graphMetadata.hypRaw.slice(...slice)
  return new Alignment("INSERT", null, slice, null, token)
}

/**
 * Get a DELETE alignment for the given token index.
 */
function getDeleteAlignmentFromTokenIndex(
  graphMetadata: GraphMetadata,
  refIndex: number,
) {
  const slice = graphMetadata.refTokenMatches[refIndex]![1]
  const token = graphMetadata.refRaw.slice(...slice)
  return new Alignment("DELETE", slice, null, token)
}
