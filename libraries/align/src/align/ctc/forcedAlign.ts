import { argmax } from "./greedyDecode.ts"
import { type Match } from "./search.ts"

export interface TokenAlignment {
  label: number
  startFrame: number
  endFrame: number
  score: number
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
function buildStateGraph(labels: number[], starId: number, blankId: number) {
  const tokens = [blankId].concat(labels.flatMap((l) => [l, blankId]))
  const skipLegal = tokens.map(
    (t, i) => i >= 2 && (t !== tokens[i - 2] || t === starId),
  )
  return { tokens, skipLegal }
}

export function ctcViterbiAlign(
  emissions: number[][],
  labels: number[],
  blankId: number,
  starId: number,
  starScore: number,
) {
  if (!labels.length) return []

  function emitScore(row: number[], token: number) {
    return token === starId ? starScore : row[token]!
  }

  const { tokens, skipLegal } = buildStateGraph(labels, starId, blankId)

  const numStates = tokens.length
  const numFrames = emissions.length
  if (!numFrames) return []

  let prevScores = new Float32Array(numStates).fill(-Infinity)
  const backpointers = new Uint8Array(numFrames * numStates)

  prevScores[0] = emissions[0]![blankId]!
  prevScores[1] = emitScore(emissions[0]!, tokens[1]!)
  // We want leading and trailing stars to be optional,
  // so if the labels start with a star, we also preload
  // the next label into the first frame's scores
  if (labels[0] === starId) {
    prevScores[2] = emissions[0]![blankId]!
    prevScores[3] = emitScore(emissions[0]!, tokens[3]!)
  }

  for (let t = 1; t < numFrames; t++) {
    const row = emissions[t]!
    const currScores = new Float32Array(numStates).fill(-Infinity)

    for (let s = 0; s < numStates; s++) {
      const token = tokens[s]!

      const moves = [prevScores[s] ?? -Infinity, prevScores[s - 1] ?? -Infinity]
      if (skipLegal[s]) {
        moves.push(prevScores[s - 2]!)
      }

      const bestOp = argmax(moves)

      currScores[s] = emitScore(row, token) + moves[bestOp]!
      backpointers[t * numStates + s] = bestOp
    }

    prevScores = currScores
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
    const row = emissions[t]!
    const token = tokens[s]!
    scoreSums[s]! += emitScore(row, token)
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

type Segment = {
  labels: number[]
  emissions: number[][]
  emissionsStart: number
}

const STAR_SCORE = -3

export function ctcForcedAlign(
  baseline: string,
  emissions: number[][],
  anchors: Match[],
  vocab: Map<string, number>,
  blankId: number,
) {
  const star = vocab.size

  const segments: Segment[] = []
  for (let i = 0; i < anchors.length + 1; i++) {
    const prevAnchor = anchors[i - 1]
    const nextAnchor = anchors[i]
    segments.push({
      labels: baseline
        .slice(prevAnchor?.offset, nextAnchor?.offset)
        .split("")
        .map((c) => vocab.get(c) ?? star),
      emissions: emissions.slice(prevAnchor?.position, nextAnchor?.position),
      emissionsStart: prevAnchor?.position ?? 0,
    })
  }

  segments[0]?.labels.unshift(star)
  segments.at(-1)?.labels.push(star)

  const alignments: TokenAlignment[] = []

  for (const segment of segments) {
    const unmapped = ctcViterbiAlign(
      segment.emissions,
      segment.labels,
      blankId,
      star,
      STAR_SCORE,
    )

    alignments.push(
      ...unmapped.map((a) => ({
        ...a,
        startFrame: a.startFrame + segment.emissionsStart,
        endFrame: a.endFrame + segment.emissionsStart,
      })),
    )
  }

  // Slice off the first and last labels, which
  // are the stars we inserted above
  return alignments.slice(1, -1)
}
