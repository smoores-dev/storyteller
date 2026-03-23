/* eslint-disable @typescript-eslint/no-non-null-assertion */
import assert from "node:assert"

import { type Path } from "./beamSearch.ts"
import { type SubgraphMetadata } from "./graphMetadata.ts"
import { Alignment, translateSlice } from "./utils.ts"

/**
 * Get a DELETE alignment for a given reference slice.
 */
function getDeleteAlignment(
  startRefIndex: number,
  endRefIndex: number,
  subgraphMetadata: SubgraphMetadata,
) {
  const refSlice = translateSlice(
    [startRefIndex, endRefIndex],
    subgraphMetadata.refIndexMap,
  )

  assert(!!refSlice)

  return new Alignment(
    "DELETE",
    refSlice,
    null,
    subgraphMetadata.refRaw.slice(...refSlice),
  )
}

/**
 * Get an INSERT alignment for a given hypothesis slice.
 */
function getInsertAlignment(
  startHypIndex: number,
  endHypIndex: number,
  subgraphMetadata: SubgraphMetadata,
) {
  const hypSlice = translateSlice(
    [startHypIndex, endHypIndex],
    subgraphMetadata.hypIndexMap,
  )

  assert(!!hypSlice)

  return new Alignment(
    "INSERT",
    null,
    hypSlice,
    null,
    subgraphMetadata.hypRaw.slice(...hypSlice),
    subgraphMetadata.hypIndexMap[startHypIndex]! >= 0,
    subgraphMetadata.hypIndexMap[endHypIndex - 1]! >= 0,
  )
}

/**
 * Get a MATCH or SUBSTITUTION alignment for the given hypothesis and reference slices.
 */
function getMatchOrSubstitutionAlignment(
  startHypIndex: number,
  endHypIndex: number,
  startRefIndex: number,
  endRefIndex: number,
  score: number,
  subgraphMetadata: SubgraphMetadata,
) {
  const hypSlice = translateSlice(
    [startHypIndex, endHypIndex],
    subgraphMetadata.hypIndexMap,
  )
  const refSlice = translateSlice(
    [startRefIndex, endRefIndex],
    subgraphMetadata.refIndexMap,
  )

  assert(!!hypSlice)
  assert(!!refSlice)

  const isMatchSegment = score === 0
  const opType = isMatchSegment ? "MATCH" : "SUBSTITUTE"

  return new Alignment(
    opType,
    refSlice,
    hypSlice,
    subgraphMetadata.refRaw.slice(...refSlice),
    subgraphMetadata.hypRaw.slice(...hypSlice),
    subgraphMetadata.hypIndexMap[startHypIndex]! >= 0,
    subgraphMetadata.hypIndexMap[endHypIndex - 1]! >= 0,
  )
}

/**
 * Get the alignments of the path.
 */
export function getAlignments(path: Path) {
  const subgraphMetadata = path.src
  const segmentationIndices = path.endIndices

  const alignments: Alignment[] = []
  let startHyp = 0
  let startRef = 0

  // eslint-disable-next-line prefer-const
  for (let [endHyp, endRef, score] of segmentationIndices) {
    endHyp += 1
    endRef += 1

    if (startHyp === endHyp) {
      const alignment = getDeleteAlignment(startRef, endRef, subgraphMetadata)
      alignments.push(alignment)
    } else if (startRef === endRef) {
      const alignment = getInsertAlignment(startHyp, endHyp, subgraphMetadata)
      alignments.push(alignment)
    } else {
      const alignment = getMatchOrSubstitutionAlignment(
        startHyp,
        endHyp,
        startRef,
        endRef,
        score,
        subgraphMetadata,
      )
      alignments.push(alignment)
    }

    startHyp = endHyp
    startRef = endRef
  }

  return alignments
}
