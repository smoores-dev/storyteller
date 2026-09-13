import { type EmissionResult } from "@storyteller-platform/ghost-story"

export type EmissionTimings = Pick<
  EmissionResult,
  "secondsPerChunk" | "secondsPerFrame" | "framesPerChunk"
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
