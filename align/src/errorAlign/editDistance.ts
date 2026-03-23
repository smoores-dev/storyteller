/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { range } from "itertools"

import { DELIMITERS, type OpType, getOpTypeComboIndex } from "./utils.ts"

/**
 * Compute the Levenshtein values for deletion, insertion, and diagonal (substitution or match).
 *
 * @param refToken The reference token.
 * @param hypToken The hypothesis token.
 * @returns A tuple containing the deletion cost, insertion cost, and diagonal cost.
 */
function getLevenshteinValues(
  refToken: string,
  hypToken: string,
): [number, number, number] {
  let diagCost: number
  if (hypToken === refToken) {
    diagCost = 0
  } else {
    diagCost = 1
  }

  return [1, 1, diagCost]
}

/**
 * Compute the error alignment values for deletion, insertion, and diagonal (substitution or match).
 *
 * @param The reference token.
 * @param The hypothesis token.
 *
 * @returns A tuple containing the deletion cost, insertion cost, and diagonal cost.
 */
function getErrorAlignValues(
  refToken: string,
  hypToken: string,
): [number, number, number] {
  let diagCost: number
  if (hypToken === refToken) {
    diagCost = 0
  } else if (DELIMITERS.has(hypToken) || DELIMITERS.has(refToken)) {
    diagCost = 3 // Note: will never be chose as insert + delete (= 2) is equivalent and cheaper.
  } else {
    diagCost = 2
  }

  return [1, 1, diagCost]
}

/**
 * Compute the edit distance score matrix between two sequences x (hyp) and y (ref)
 * using only pure Python lists.
 *
 * @param ref The reference sequence/transcript.
 * @param hyp The hypothesis sequence/transcript.
 * @param scoreFunc A function that takes two tokens (refToken, hypToken) and returns
 *                  a tuple of (deletionCost, insertionCost, diagonalCost)
 * @param backtrace Whether to compute the backtrace matrix.
 * @returns The score matrix and optionally the backtrace matrix
 */

export function computeDistanceMatrix(
  ref: string | string[],
  hyp: string | string[],
  scoreFunc: (refToken: string, hypToken: string) => [number, number, number],
): number[][]
export function computeDistanceMatrix(
  ref: string | string[],
  hyp: string | string[],
  scoreFunc: (refToken: string, hypToken: string) => [number, number, number],
  backtrace: boolean,
): { scoreMatrix: number[][]; backtraceMatrix: number[][] }
export function computeDistanceMatrix(
  ref: string | string[],
  hyp: string | string[],
  scoreFunc: (refToken: string, hypToken: string) => [number, number, number],
  backtrace = false,
): number[][] | { scoreMatrix: number[][]; backtraceMatrix: number[][] } {
  const hypDim = hyp.length + 1
  const refDim = ref.length + 1

  const scoreMatrix = Array.from(range(hypDim)).map((_) =>
    Array.from(range(refDim)).map((_) => 0),
  )
  for (const j of range(refDim)) {
    scoreMatrix[0]![j] = j
  }
  for (const i of range(hypDim)) {
    scoreMatrix[i]![0] = i
  }

  let backtraceMatrix: number[][] | null = null
  // Create backtrace matrix and operation combination map and initialize
  // first row and column.
  // Each operation combination is dynamically assigned a unique integer
  if (backtrace) {
    backtraceMatrix = Array.from(range(hypDim)).map((_) =>
      Array.from(range(refDim)).map((_) => 0),
    )
    backtraceMatrix[0]![0] = getOpTypeComboIndex(["MATCH"])
    for (const j of range(1, refDim)) {
      backtraceMatrix[0]![j] = getOpTypeComboIndex(["DELETE"])
    }
    for (const i of range(1, hypDim)) {
      backtraceMatrix[i]![0] = getOpTypeComboIndex(["INSERT"])
    }
  }

  // Fill in the score backtrace matrix.
  for (const j of range(1, refDim)) {
    for (const i of range(1, hypDim)) {
      const [insCost, delCost, diagCost] = scoreFunc(ref[j - 1]!, hyp[i - 1]!)

      const insVal = scoreMatrix[i - 1]![j]! + insCost
      const delVal = scoreMatrix[i]![j - 1]! + delCost
      const diagVal = scoreMatrix[i - 1]![j - 1]! + diagCost
      const newVal = Math.min(insVal, delVal, diagVal)
      scoreMatrix[i]![j] = newVal

      // Track possible operations (note that the order of operations matters).
      if (backtraceMatrix) {
        const posOps: OpType[] = []
        if (diagVal === newVal && diagCost <= 0) {
          posOps.push("MATCH")
        }
        if (insVal === newVal) {
          posOps.push("INSERT")
        }
        if (delVal === newVal) {
          posOps.push("DELETE")
        }
        if (diagVal === newVal && diagCost > 0) {
          posOps.push("SUBSTITUTE")
        }
        backtraceMatrix[i]![j] = getOpTypeComboIndex(posOps)
      }
    }
  }

  if (backtraceMatrix) {
    return { scoreMatrix, backtraceMatrix }
  }

  return scoreMatrix
}

/**
 * Compute the Levenshtein distance matrix between two sequences.
 *
 * @param ref The reference sequence/transcript.
 * @param hyp The hypothesis sequence/transcript.
 * @param backtrace Whether to compute the backtrace matrix.
 *
 * @returns The score matrix and optionally the backtrace matrix
 */
export function computeLevenshteinDistanceMatrix(
  ref: string | string[],
  hyp: string | string[],
): number[][]
export function computeLevenshteinDistanceMatrix(
  ref: string | string[],
  hyp: string | string[],
  backtrace: true,
): { scoreMatrix: number[][]; backtraceMatrix: number[][] }
export function computeLevenshteinDistanceMatrix(
  ref: string | string[],
  hyp: string | string[],
  backtrace = false,
): number[][] | { scoreMatrix: number[][]; backtraceMatrix: number[][] } {
  return computeDistanceMatrix(ref, hyp, getLevenshteinValues, backtrace)
}

/**
 * Compute the error alignment distance matrix between two sequences.
 *
 * @param ref The reference sequence/transcript.
 * @param hyp The hypothesis sequence/transcript.
 * @param backtrace Whether to compute the backtrace matrix.
 *
 * @returns The score matrix and optionally the backtrace matrix.
 */
export function computeErrorAlignDistanceMatrix(
  ref: string | string[],
  hyp: string | string[],
): number[][]
export function computeErrorAlignDistanceMatrix(
  ref: string | string[],
  hyp: string | string[],
  backtrace: true,
): { scoreMatrix: number[][]; backtraceMatrix: number[][] }
export function computeErrorAlignDistanceMatrix(
  ref: string | string[],
  hyp: string | string[],
  backtrace = false,
): number[][] | { scoreMatrix: number[][]; backtraceMatrix: number[][] } {
  return computeDistanceMatrix(ref, hyp, getErrorAlignValues, backtrace)
}
