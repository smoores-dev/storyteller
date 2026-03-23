/* eslint-disable @typescript-eslint/no-non-null-assertion */
import assert from "node:assert"

import { type Index } from "./backtraceGraph.ts"
import { type SubgraphMetadata } from "./graphMetadata.ts"
import { hash } from "./hash.ts"
import { END_DELIMITER, START_DELIMITER, translateSlice } from "./utils.ts"

const INT64_MASK = (1n << 64n) - 1n
const SORT_ID_BASE = 146527n

/**
 * Class to represent a graph path.
 */
export class Path {
  public refIndex = -1
  public hypIndex = -1
  public lastHypIndex = -1
  public lastRefIndex = -1
  public closedCost = 0
  public openCost = 0
  public atUnambiguousMatchNode = false
  public endIndices: [number, number, number][] = []
  public sortId = 0n

  constructor(public src: SubgraphMetadata) {}

  /**
   * Get the ID of the path used for pruning.
   */
  get pruneId() {
    return hash([
      this.hypIndex,
      this.refIndex,
      this.lastHypIndex,
      this.lastRefIndex,
    ])
  }

  /**
   * Get the cost of the path.
   */
  get cost() {
    const isSub = isSubstitution(
      this.hypIndex,
      this.refIndex,
      this.lastHypIndex,
      this.lastRefIndex,
    )
    return this.closedCost + this.openCost + (isSub ? this.openCost : 0)
  }

  /**
   * Get the normalized cost of the path.
   */
  get normCost() {
    const cost = this.cost
    if (cost === 0) return 0
    return cost / (this.refIndex + this.hypIndex + 3) // NOTE: +3 to avoid zero division. Root = (-1,-1).
  }

  /**
   * Get the current node index of the path.
   */
  get index(): Index {
    return [this.hypIndex, this.refIndex]
  }

  /**
   * Check if the path has reached the terminal node.
   */
  get atEnd() {
    return (
      this.hypIndex === this.src.hypMaxIndex &&
      this.refIndex === this.src.refMaxIndex
    )
  }

  /**
   * Update the sort ID for path ordering. Ensures identical behavior as C++ implementation.
   */
  updateSortId(t: bigint) {
    this.sortId = (this.sortId * SORT_ID_BASE + t) & INT64_MASK
  }
}

// =================================================
// PATH EXPANSION
// =================================================

/**
 * Expand the path by transitioning to child nodes.
 *
 * @yields The expanded child paths.
 */
function* expand(parent: Path) {
  const deletePath = addDelete(parent)
  if (deletePath) yield deletePath

  const insertPath = addInsert(parent)
  if (insertPath) yield insertPath

  const subOrMatchPath = addSubstitutionOrMatch(parent)
  if (subOrMatchPath) yield subOrMatchPath
}

/**
 * Expand the given path by adding a substitution or match operation.
 */
function addSubstitutionOrMatch(parent: Path) {
  if (
    parent.refIndex >= parent.src.refMaxIndex ||
    parent.hypIndex >= parent.src.hypMaxIndex
  ) {
    return null
  }

  let child: Path | null = transitionToChildNode(parent, {
    refStep: 1,
    hypStep: 1,
  })
  const isMatch =
    parent.src.ref[child.refIndex] === parent.src.hyp[child.hypIndex]
  if (!isMatch) {
    const refIsDelimiter = parent.src.refCharTypes[child.refIndex] === 0 // NOTE: 0 indicates delimiter
    const hypIsDelimiter = parent.src.hypCharTypes[child.hypIndex] === 0
    if (refIsDelimiter || hypIsDelimiter) return null
  }

  if (parent.src.ref[child.refIndex] === START_DELIMITER) {
    endInsertionSegment(child, parent.hypIndex, parent.refIndex)
  }

  if (!isMatch) {
    const isBacktrace = parent.src.backtraceNodeSet.has(parent.index)
    const isLetterTypeMatch =
      parent.src.refCharTypes[child.refIndex] ===
      parent.src.hypCharTypes[child.hypIndex]
    child.openCost += isLetterTypeMatch ? 2 : 3
    child.openCost += isBacktrace ? 0 : 1
  }

  if (child.src.ref[child.refIndex] === END_DELIMITER) {
    child = endSegment(child)
  }

  return child
}

/**
 * Expand the path by adding an insert operation.
 */
function addInsert(parent: Path) {
  if (parent.refIndex >= parent.src.refMaxIndex) {
    return null
  }

  let child: Path | null = transitionToChildNode(parent, {
    refStep: 1,
    hypStep: 0,
  })
  if (parent.src.ref[child.refIndex] === START_DELIMITER) {
    endInsertionSegment(child, parent.hypIndex, parent.refIndex)
  }

  const isBacktrace = parent.src.backtraceNodeSet.has(parent.index)
  const isDelimiter = parent.src.refCharTypes[child.refIndex] === 0
  child.openCost += isDelimiter ? 1 : 2
  child.openCost += isBacktrace || isDelimiter ? 0 : 1

  if (child.src.ref[child.refIndex] === END_DELIMITER) {
    child = endSegment(child)
  }

  return child
}

/**
 * Expand the path by adding a delete operation.
 */
function addDelete(parent: Path) {
  if (parent.hypIndex >= parent.src.hypMaxIndex) {
    return null
  }

  const child = transitionToChildNode(parent, { refStep: 0, hypStep: 1 })
  const isBacktrace = parent.src.backtraceNodeSet.has(parent.index)
  const isDelimiter = parent.src.hypCharTypes[child.hypIndex] === 0
  child.openCost += isDelimiter ? 1 : 2
  child.openCost += isBacktrace || isDelimiter ? 0 : 1

  if (child.src.hyp[child.hypIndex] === END_DELIMITER) {
    endInsertionSegment(child, child.hypIndex, child.refIndex)
  }

  return child
}

// =====================================
// PATH EXPANSION HELPERS
// =====================================

/**
 * Apply updates when segment end is detected.
 */
function resetSegmentVariables(path: Path, hypIndex: number, refIndex: number) {
  path.closedCost += path.openCost
  const isSub = isSubstitution(
    hypIndex,
    refIndex,
    path.lastHypIndex,
    path.lastRefIndex,
  )
  path.closedCost += isSub ? path.openCost : 0
  path.lastHypIndex = hypIndex
  path.lastRefIndex = refIndex
  path.openCost = 0
}

/**
 * End the current segment, if criteria for an insertion are met.
 */
function endInsertionSegment(path: Path, hypIndex: number, refIndex: number) {
  const hypSlice = translateSlice(
    [path.lastHypIndex + 1, hypIndex + 1],
    path.src.hypIndexMap,
  )
  const refIsEmpty = refIndex === path.lastRefIndex
  if (hypSlice && refIsEmpty) {
    path.endIndices = path.endIndices.concat([
      [path.hypIndex, path.refIndex, path.openCost],
    ])
    resetSegmentVariables(path, hypIndex, refIndex)
  }
}

/**
 * End the current segment, if criteria for an insertion, a substitution, or a match are met.
 */
function endSegment(path: Path) {
  const hypSlice = translateSlice(
    [path.lastHypIndex + 1, path.hypIndex + 1],
    path.src.hypIndexMap,
  )
  const refSlice = translateSlice(
    [path.lastRefIndex + 1, path.refIndex + 1],
    path.src.refIndexMap,
  )

  assert(!!refSlice)

  const hypIsEmpty = path.hypIndex === path.lastHypIndex
  if (hypIsEmpty) {
    path.endIndices = path.endIndices.concat([
      [path.hypIndex, path.refIndex, path.openCost],
    ])
  } else {
    // TODO: Handle edge case where hyp has only covered delimiters.
    if (!hypSlice) {
      return null
    }

    const isMatchSegment = path.openCost === 0
    path.atUnambiguousMatchNode =
      isMatchSegment && path.src.unambiguousMatches.has(path.index)
    path.endIndices = path.endIndices.concat([
      [path.hypIndex, path.refIndex, path.openCost],
    ])
  }

  resetSegmentVariables(path, path.hypIndex, path.refIndex)
  return path
}

/**
 * Transition to a child node by creating a new Path instance.
 */
function transitionToChildNode(
  parent: Path,
  { refStep, hypStep }: { refStep: number; hypStep: number },
) {
  const child = new Path(parent.src)
  child.refIndex = parent.refIndex + refStep
  child.hypIndex = parent.hypIndex + hypStep
  child.lastHypIndex = parent.lastHypIndex
  child.lastRefIndex = parent.lastRefIndex
  child.closedCost = parent.closedCost
  child.openCost = parent.openCost
  child.atUnambiguousMatchNode = false
  child.endIndices = parent.endIndices
  child.sortId = parent.sortId
  child.updateSortId(BigInt(refStep + refStep + hypStep))
  return child
}

/**
 * Get the substitution penalty given an index.
 */
function isSubstitution(
  hypIndex: number,
  refIndex: number,
  lastHypIndex: number,
  lastRefIndex: number,
) {
  // NOTE: Since *Index is guaranteed to be equal to or higher than\
  // last*Index, we only need to check for equality
  return !(refIndex === lastRefIndex || hypIndex === lastHypIndex)
}

// ================================
// MAIN BEAM SEARCH FUNCTION
// ================================

/**
 * Perform beam search to align reference and hypothesis texts for a given source.
 *
 * @param src The source metadata for alignment.
 * @param beamSize The size of the beam for beam search. Defaults to 100.
 */
export function errorAlignBeamSearch(
  src: SubgraphMetadata,
  beamSize = 100,
): Path {
  const startPath = new Path(src)
  let beam = [startPath]
  let pruneMap: Record<number, number> = {}
  const ended: Path[] = []

  while (beam.length > 0) {
    const newBeam: Record<number, Path> = {}

    for (const path of beam) {
      if (path.atEnd) {
        ended.push(path)
        continue
      }

      for (const newPath of expand(path)) {
        const newPathCost = newPath.cost
        const newPathPruneId = newPath.pruneId
        if (newPathPruneId in pruneMap) {
          if (newPathCost > pruneMap[newPathPruneId]!) {
            continue
          }
        }

        pruneMap[newPathPruneId] = newPathCost
        if (
          !(newPathPruneId in newBeam) ||
          newPathCost < newBeam[newPathPruneId]!.cost
        ) {
          newBeam[newPathPruneId] = newPath
        }
      }
    }

    const newBeamPaths = Object.values(newBeam).toSorted((a, b) => {
      if (a.normCost === b.normCost) {
        const comp = a.sortId - b.sortId
        if (comp < 0n) return -1
        if (comp > 0n) return 1
        return 0
      }
      return a.normCost - b.normCost
    })
    beam = newBeamPaths.slice(0, beamSize)

    if (beam[0]?.atUnambiguousMatchNode) {
      beam = beam.slice(0, 1)
      pruneMap = {}
    }
  }

  const [result] = ended.toSorted((a, b) => {
    if (a.cost === b.cost) {
      const comp = a.sortId - b.sortId
      if (comp < 0n) return -1
      if (comp > 0n) return 1
      return 0
    }
    return a.cost - b.cost
  })

  assert(!!result)

  return result
}
