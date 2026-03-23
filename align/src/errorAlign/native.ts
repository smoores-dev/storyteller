import { resolve } from "node:path"

import requireBinding from "node-gyp-build"

import { Path } from "./beamSearch.ts"
import type { SubgraphMetadata } from "./graphMetadata.ts"

const native = requireBinding(
  process.env["ERROR_ALIGN_NATIVE_BINDING"] ||
    resolve(import.meta.dirname, "../../"),
) as {
  computeLevenshteinDistanceMatrix(
    ref: string | string[],
    hyp: string | string[],
    backtrace: boolean,
  ): number[][] | { scoreMatrix: number[][]; backtraceMatrix: number[][] }
  computeErrorAlignDistanceMatrix(
    ref: string | string[],
    hyp: string | string[],
    backtrace: boolean,
  ): number[][] | { scoreMatrix: number[][]; backtraceMatrix: number[][] }
  errorAlignBeamSearch(
    src: SubgraphMetadata,
    beamSize: number,
  ): [number, number, number][]
}

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
  return native.computeLevenshteinDistanceMatrix(ref, hyp, backtrace)
}

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
  return native.computeErrorAlignDistanceMatrix(ref, hyp, backtrace)
}

export function errorAlignBeamSearch(
  src: SubgraphMetadata,
  beamSize = 100,
): Path {
  const endIndices = native.errorAlignBeamSearch(src, beamSize)
  const path = new Path(src)
  path.endIndices = endIndices
  return path
}
