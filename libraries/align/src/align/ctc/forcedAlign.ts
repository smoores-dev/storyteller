import { enumerate, range } from "itertools"

import { type Emissions } from "@storyteller-platform/ghost-story"

import { type Match } from "./search.ts"

export interface TokenAlignment {
  label: number
  startFrame: number
  endFrame: number
  score: number
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
function buildStateGraph(labels: number[], starId: number, blankId: number) {
  const tokens = new Int32Array(2 * labels.length + 1).fill(blankId)
  for (const [i, label] of labels.entries()) tokens[2 * i + 1] = label

  const skipLegal = new Uint8Array(tokens.length)
  for (let s = 2; s < tokens.length; s++) {
    skipLegal[s] = tokens[s] !== tokens[s - 2] || tokens[s] === starId ? 1 : 0
  }
  return { tokens, skipLegal }
}

export function ctcViterbiAlign(
  { values, frames: numFrames, classes }: Emissions,
  labels: number[],
  blankId: number,
  starId: number,
  starScore: number,
) {
  if (!labels.length) return []
  if (!numFrames) return []

  const { tokens, skipLegal } = buildStateGraph(labels, starId, blankId)
  const numStates = tokens.length

  const starColumn = classes
  const columns = classes + 1
  const scores = new Float32Array(numFrames * columns)
  for (let t = 0; t < numFrames; t++) {
    scores.set(values.subarray(t * classes, (t + 1) * classes), t * columns)
    scores[t * columns + starColumn] = starScore
  }
  const stateColumn = new Int32Array(numStates)
  for (let s = 0; s < numStates; s++) {
    stateColumn[s] = tokens[s] === starId ? starColumn : tokens[s]!
  }

  let prevScores = new Float32Array(numStates).fill(-Infinity)
  let currScores = new Float32Array(numStates)
  const backpointers = new Uint8Array(numFrames * numStates)

  prevScores[0] = scores[stateColumn[0]!]!
  prevScores[1] = scores[stateColumn[1]!]!
  // We want leading and trailing stars to be optional,
  // so if the labels start with a star, we also preload
  // the next label into the first frame's scores
  if (labels[0] === starId) {
    prevScores[2] = scores[stateColumn[2]!]!
    prevScores[3] = scores[stateColumn[3]!]!
  }

  for (let t = 1; t < numFrames; t++) {
    const row = t * columns
    const backpointerRow = t * numStates

    for (let s = 0; s < numStates; s++) {
      // be extremely careful in this loop
      // this path is EXTREMELY HOT and every nanosecond counts
      // (literally! this going from 6->4ns per cell almost halved alignment times!)
      // be careful to do as few allocations as possible
      // easy trap: make have a single expression need to conditinally
      // do x = y ? number : array[index]
      // this is very expensive for obscure v8 reasons
      // this is why we do this weird stateColumn thing below
      let best = prevScores[s]!
      let bestOp = 0

      if (s > 0 && prevScores[s - 1]! > best) {
        best = prevScores[s - 1]!
        bestOp = 1
      }

      if (skipLegal[s] && prevScores[s - 2]! > best) {
        best = prevScores[s - 2]!
        bestOp = 2
      }

      currScores[s] = scores[row + stateColumn[s]!]! + best
      backpointers[backpointerRow + s] = bestOp
    }

    ;[prevScores, currScores] = [currScores, prevScores]
  }

  const terminalCandidates = [
    numStates - 1,
    numStates - 2,
    // Same as above, only allow skipping the last label
    // if it's a star
    ...(labels.at(-1) === starId ? [numStates - 3, numStates - 4] : []),
  ].filter((s) => s >= 0)

  let terminal = terminalCandidates[0]!
  for (const s of terminalCandidates) {
    if (prevScores[s]! > prevScores[terminal]!) terminal = s
  }

  if (prevScores[terminal] === -Infinity) {
    return labels.map((label) => ({
      label,
      startFrame: -1,
      endFrame: -1,
      score: -Infinity,
    }))
  }

  const path = new Int32Array(numFrames)
  path[numFrames - 1] = terminal

  for (let t = numFrames - 1; t > 0; t--) {
    const s = path[t]!
    const op = backpointers[t * numStates + s]!
    path[t - 1] = s - op
  }

  const firstFrames = new Int32Array(numStates).fill(-1)
  const lastFrames = new Int32Array(numStates).fill(-1)
  const scoreSums = new Float64Array(numStates)
  const frameCounts = new Int32Array(numStates)

  for (let t = 0; t < numFrames; t++) {
    const s = path[t]!
    if (firstFrames[s] === -1) firstFrames[s] = t
    lastFrames[s] = t
    scoreSums[s]! += scores[t * columns + stateColumn[s]!]!
    frameCounts[s]!++
  }

  const alignments: TokenAlignment[] = []

  for (let l = 0; l < labels.length; l++) {
    const state = 2 * l + 1

    const startFrame = firstFrames[state]!
    const endFrame = lastFrames[state]!
    const scoreSum = scoreSums[state]!
    const frameCount = frameCounts[state]!

    const meanScore = frameCount > 0 ? scoreSum / frameCount : -Infinity

    alignments.push({
      label: labels[l]!,
      startFrame,
      endFrame,
      score: meanScore,
    })
  }

  return alignments
}

export function detectDroppedLabels(
  alignments: TokenAlignment[],
  startOffset: number,
  endOffset: number,
  minLength = 8,
) {
  if (endOffset < startOffset || endOffset - startOffset <= minLength) {
    return false
  }

  const endFrame = alignments[endOffset]?.endFrame
  if (endFrame === undefined) {
    throw new Error(`endOffset ${endOffset} out of bounds`)
  }
  const startFrame = alignments[startOffset]?.startFrame
  if (startFrame === undefined) {
    throw new Error(`startOffset ${startOffset} out of bounds`)
  }

  const framesPerChar = (endFrame - startFrame) / (endOffset - startOffset)
  if (framesPerChar >= 2) return false

  const goodChars = alignments
    .slice(startOffset, endOffset + 1)
    .reduce((acc, a) => acc + (a.score > -4 ? 1 : 0), 0)

  return goodChars / (endOffset + 1 - startOffset) < 0.5
}

function removeLabelRanges(
  input: number[],
  /* inclusive */ removals: [number, number][],
) {
  const inputIndices: number[] = []
  let nextRemovalIndex = 0
  const result: number[] = []
  let i = 0
  while (i < input.length) {
    const l = input[i]!
    const nextRemoval = removals[nextRemovalIndex]

    if (!nextRemoval) {
      inputIndices.push(i)
      result.push(l)
      i++
      continue
    }

    if (i >= nextRemoval[0] && i <= nextRemoval[1]) {
      i++
      continue
    }

    if (i > nextRemoval[1]) {
      nextRemovalIndex++
      continue
    }

    inputIndices.push(i)
    result.push(l)
    i++
  }

  return { result, inputIndices }
}

type Segment = {
  labels: number[]
  labelsStart: number
  emissions: Emissions
  emissionsStart: number
}

const STAR_SCORE = -3

export function ctcForcedAlign(
  baseline: string,
  emissions: Emissions,
  anchors: Match[],
  vocab: Map<string, number>,
  blankId: number,
  dropLabels: (
    labelOffset: number,
    alignments: TokenAlignment[],
  ) => [number, number][] = () => [],
) {
  const star = vocab.size

  const segments: Segment[] = []
  for (let i = 0; i < anchors.length + 1; i++) {
    const prevAnchor = anchors[i - 1]
    const nextAnchor = anchors[i]
    const framesFrom = prevAnchor?.position ?? 0
    const framesTo = nextAnchor?.position ?? emissions.frames
    segments.push({
      labels: baseline
        .slice(prevAnchor?.offset, nextAnchor?.offset)
        .split("")
        .map((c) => vocab.get(c) ?? star),
      labelsStart: prevAnchor?.offset ?? 0,
      emissions: {
        values: emissions.values.subarray(
          framesFrom * emissions.classes,
          framesTo * emissions.classes,
        ),
        frames: framesTo - framesFrom,
        classes: emissions.classes,
      },
      emissionsStart: framesFrom,
    })
  }

  segments[0]?.labels.unshift(star)
  segments.at(-1)?.labels.push(star)

  const alignmentsWithRemovals: TokenAlignment[] = []
  const inputIndices: number[] = []

  for (const segment of segments) {
    // eslint-disable-next-line no-inner-declarations
    function stripBoundingStars<E>(arr: E[]) {
      let result = arr
      if (segment === segments[0]) {
        result = result.slice(1)
      }
      if (segment === segments.at(-1)) {
        result = result.slice(0, -1)
      }
      return result
    }

    let indices = Array.from(range(stripBoundingStars(segment.labels).length))

    let unmapped = ctcViterbiAlign(
      segment.emissions,
      segment.labels,
      blankId,
      star,
      STAR_SCORE,
    )

    const dropped = dropLabels(
      segment.labelsStart,
      stripBoundingStars(unmapped),
    ).map<[number, number]>(([s, e]) => [
      s - segment.labelsStart,
      e - segment.labelsStart,
    ])

    if (dropped.length) {
      const { result: adjustedLabels, inputIndices: adjustedIndices } =
        removeLabelRanges(stripBoundingStars(segment.labels), dropped)

      indices = adjustedIndices

      if (segment === segments[0]) {
        adjustedLabels.unshift(star)
      }
      if (segment === segments.at(-1)) {
        adjustedLabels.push(star)
      }

      unmapped = ctcViterbiAlign(
        segment.emissions,
        adjustedLabels,
        blankId,
        star,
        STAR_SCORE,
      )
    }

    const segmentAlignments = unmapped.map((a) => ({
      ...a,
      startFrame: a.startFrame + segment.emissionsStart,
      endFrame: a.endFrame + segment.emissionsStart,
    }))

    inputIndices.push(...indices.map((i) => i + segment.labelsStart))
    alignmentsWithRemovals.push(...segmentAlignments)
  }

  const alignments: TokenAlignment[] = []

  // Slice off the first and last labels, which
  // are the stars we inserted above
  for (const [k, a] of enumerate(alignmentsWithRemovals.slice(1, -1))) {
    const i = inputIndices[k]!

    const lastUndroppedIndex = alignments.length - 1
    const lastUndropped = alignments[lastUndroppedIndex] ?? {
      startFrame: 0,
      endFrame: 0,
      score: -Infinity,
      label: star,
    }

    for (const j of range(lastUndroppedIndex, i - 1)) {
      alignments.push({
        startFrame: lastUndropped.endFrame,
        endFrame: lastUndropped.endFrame,
        score: -Infinity,
        label: vocab.get(baseline[j]!)!,
      })
    }

    alignments[i] = a
  }

  return alignments
}
