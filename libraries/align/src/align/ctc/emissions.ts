import { type EmissionResult } from "@storyteller-platform/ghost-story"

export type EmissionTimings = Pick<
  EmissionResult,
  | "secondsPerChunk"
  | "secondsPerFrame"
  | "framesPerChunk"
  | "startOffsetSeconds"
  | "endOffsetSeconds"
>

export function secondsToFrames(
  seconds: number,
  emissionTimings: EmissionTimings,
) {
  const chunks = Math.floor(seconds / emissionTimings.secondsPerChunk)
  const remainder = seconds - chunks * emissionTimings.secondsPerChunk
  return (
    chunks * emissionTimings.framesPerChunk +
    Math.floor(remainder / emissionTimings.secondsPerFrame)
  )
}

export function framesToSeconds(
  frames: number,
  emissionTimings: EmissionTimings,
) {
  return (
    Math.floor(frames / emissionTimings.framesPerChunk) *
      emissionTimings.secondsPerChunk +
    (frames % emissionTimings.framesPerChunk) * emissionTimings.secondsPerFrame
  )
}

/**
 * The model's spike to boundary offsets in whole frames, so the aligner can
 * shift a spike before it clamps the boundary against its neighbours.
 */
export function boundaryOffsetFrames(emissionTimings: EmissionTimings) {
  return {
    start: Math.round(
      emissionTimings.startOffsetSeconds / emissionTimings.secondsPerFrame,
    ),
    end: Math.round(
      emissionTimings.endOffsetSeconds / emissionTimings.secondsPerFrame,
    ),
  }
}
