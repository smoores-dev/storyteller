import { startsWithSpacelessScript } from "./SpacelessScripts.ts"
import type { Timeline, TimelineEntry } from "./Timeline.ts"

// 16k sample rate
const WHISPER_SAMPLE_RATE = 16000

// calculate where whisper will split audio for multi-processor transcription
export function calculateWhisperSplits(
  durationSeconds: number,
  numProcessors: number,
  sampleRate: number = WHISPER_SAMPLE_RATE,
): number[] {
  if (numProcessors <= 1) return []

  const totalSamples = Math.floor(durationSeconds * sampleRate)
  const samplesPerProcessor = Math.floor(totalSamples / numProcessors)

  const splits: number[] = []
  for (let i = 1; i < numProcessors; i++) {
    const splitSamples = i * samplesPerProcessor
    const splitSeconds = splitSamples / sampleRate
    splits.push(splitSeconds)
  }

  return splits
}

// normalized intermediate representation for whisper output
export interface RawWhisperSegment {
  text: string
  /** seconds */
  segmentStart: number
  /** secods */
  segmentEnd: number
  words: RawWhisperWord[]
}

export interface RawWhisperWord {
  text: string
  /** seconds */
  start: number
  /** seconds */
  end: number
  confidence: number
}

// whisper-cpp output types
export interface WhisperCppTranscriptionSegment {
  text: string
  timestamps: { from: string; to: string }
  offsets: { from: number; to: number }
  tokens: WhisperCppToken[]
}

export interface WhisperCppToken {
  text: string
  timestamps: { from: string; to: string }
  offsets?: { from: number; to: number }
  t_dtw: number
  p: number
  id: number
}

// whisper-server output types
export interface WhisperServerSegment {
  text: string
  start: number
  end: number
  words?: WhisperServerWord[]
}

export interface WhisperServerWord {
  word: string
  start: number
  end: number
  probability?: number
}

// special tokens that whisper uses internally
const specialTokenPattern = /\[_.+\]|<\|[a-z_]+\|>/g

const REPLACEMENT_CHAR = "\uFFFD"

function isSpecialToken(text: string): boolean {
  return text.startsWith("[_") || text.startsWith("<|")
}

function hasUtf8Corruption(text: string): boolean {
  return text.includes(REPLACEMENT_CHAR)
}

// when node reads whisper json with utf-8 encoding, invalid byte fragments
// from split bpe tokens become U+FFFD replacement characters.
// the segment-level text is still valid, so we use it as ground truth and
// merge consecutive corrupted fragments into one reconstructed run.
interface Utf8Run<T> {
  first: T
  last: T
  text: string
  probability: number
  isMerged: boolean
}

interface Utf8MergeOptions<T> {
  getText: (item: T) => string
  getProbability: (item: T) => number
  shouldSkipInAnchor: (item: T) => boolean
}

function buildAnchor<T>(
  items: readonly T[],
  startIdx: number,
  options: Utf8MergeOptions<T>,
  maxItems: number = 5,
): string {
  let anchor = ""
  let count = 0

  for (let j = startIdx; j < items.length && count < maxItems; j++) {
    const item = items[j]
    if (!item) break

    const text = options.getText(item)
    if (options.shouldSkipInAnchor(item)) continue
    if (hasUtf8Corruption(text)) break

    anchor += text
    count++
  }

  return anchor
}

function forEachMergedUtf8Run<T>(
  items: readonly T[],
  segmentText: string,
  options: Utf8MergeOptions<T>,
  emit: (run: Utf8Run<T>) => void,
): void {
  let segPos = 0
  let i = 0

  while (i < items.length) {
    const item = items[i]
    if (!item) break

    const text = options.getText(item)
    const isSkippable = options.shouldSkipInAnchor(item)

    if (isSkippable || !hasUtf8Corruption(text)) {
      if (!isSkippable) {
        segPos += text.length
      }

      emit({
        first: item,
        last: item,
        text,
        probability: options.getProbability(item),
        isMerged: false,
      })
      i++
      continue
    }

    const runStart = i
    let probability = 1

    while (i < items.length) {
      const runItem = items[i]
      if (!runItem) break

      const runText = options.getText(runItem)
      const shouldStop =
        options.shouldSkipInAnchor(runItem) || !hasUtf8Corruption(runText)

      if (shouldStop) break

      probability *= options.getProbability(runItem)
      i++
    }

    const first = items[runStart]
    const last = items[i - 1]
    if (!first || !last) continue

    const anchor = buildAnchor(items, i, options)
    const anchorIdx =
      anchor.length > 0 ? segmentText.indexOf(anchor, segPos) : -1

    const runEndSegPos = anchorIdx >= 0 ? anchorIdx : segmentText.length
    const mergedText = segmentText.slice(segPos, runEndSegPos)
    segPos = runEndSegPos

    emit({
      first,
      last,
      text: mergedText,
      probability,
      isMerged: true,
    })
  }
}

export function parseWhisperCppOutput(
  transcription: WhisperCppTranscriptionSegment[],
): RawWhisperSegment[] {
  return transcription.map((segment) => {
    const words: RawWhisperWord[] = []
    let lastTokenEndMs = 0

    forEachMergedUtf8Run(
      segment.tokens,
      segment.text,
      {
        getText: (token) => token.text,
        getProbability: (token) => token.p,
        shouldSkipInAnchor: (token) => isSpecialToken(token.text),
      },
      (run) => {
        const cleanedText = run.text.replace(specialTokenPattern, "")
        if (cleanedText.trim().length === 0) return

        const fallbackOffset = run.isMerged ? 0 : lastTokenEndMs
        const offsetFrom = run.first.offsets?.from ?? fallbackOffset
        const offsetTo = run.last.offsets?.to ?? fallbackOffset

        if (run.isMerged || run.last.offsets) {
          lastTokenEndMs = offsetTo
        }

        words.push({
          text: cleanedText,
          start: offsetFrom / 1000,
          end: offsetTo / 1000,
          confidence: run.probability,
        })
      },
    )

    return {
      text: segment.text,
      segmentStart: segment.offsets.from / 1000,
      segmentEnd: segment.offsets.to / 1000,
      words,
    }
  })
}

export function parseWhisperServerOutput(
  segments: WhisperServerSegment[],
): RawWhisperSegment[] {
  return segments.map((segment) => {
    const words: RawWhisperWord[] = []

    forEachMergedUtf8Run(
      segment.words ?? [],
      segment.text,
      {
        getText: (word) => word.word,
        getProbability: (word) => word.probability ?? 1,
        shouldSkipInAnchor: () => false,
      },
      (run) => {
        const confidence = run.isMerged
          ? run.probability
          : run.first.probability ?? 0

        words.push({
          text: run.text,
          start: run.first.start,
          end: run.last.end,
          confidence,
        })
      },
    )

    return {
      text: segment.text,
      segmentStart: segment.start,
      segmentEnd: segment.end,
      words,
    }
  })
}

interface CorrectionState {
  cumulativeOffset: number
  lastSegmentEnd: number
  lastWordEnd: number
}

// roughly 150ms per character. very arbitrary, is probably
// shorter, but we justwant to be able to catch egrigious examples
const MS_PER_CHAR = 0.1
const MAX_REASONABLE_WORD_DURATION = 2
const LOW_CONFIDENCE_THRESHOLD = 0.3

function estimateReasonableDuration(text: string): number {
  const charCount = text.trim().length
  return Math.max(0.1, charCount * MS_PER_CHAR)
}

/**
 * check if a segment is time traveling, ie has a backwards timestamp
 * this usually happens at the start or end of a split,
 * and indicates that the segment is corrupted and we should correct it
 * manually with some heuristics
 */
const isTimeTravelingSegment = (segment: RawWhisperSegment): boolean => {
  return segment.segmentStart > segment.segmentEnd
}

function detectProcessorBoundary(
  segment: RawWhisperSegment,
  state: CorrectionState,
):
  | {
      isBoundary: false
    }
  | {
      isBoundary: true
      reason: "TIME_TRAVEL" | "UNEXPLAINED_SKIP" | "RESET_TO_ZERO"
    } {
  if (segment.words.length === 0) return { isBoundary: false }

  const firstWord = segment.words[0]
  if (!firstWord) return { isBoundary: false }

  const wordStartsNearZero = firstWord.start < 2.0

  if (!wordStartsNearZero) return { isBoundary: false }

  // case 1: segment jumps forward from where we left off
  const segmentJumpsForward = segment.segmentStart > state.lastSegmentEnd + 1.0
  if (segmentJumpsForward)
    return { isBoundary: true, reason: "UNEXPLAINED_SKIP" }

  // case 2: segment has backwards timestamps (end < start), indicating corruption
  const segmentGoesBackwards = isTimeTravelingSegment(segment)
  if (segmentGoesBackwards) return { isBoundary: true, reason: "TIME_TRAVEL" }

  // if the last word end is greater than the first word start, we have a reset to zero, and definitely entered a new boundary
  if (state.lastWordEnd > firstWord.start)
    return { isBoundary: true, reason: "RESET_TO_ZERO" }

  return { isBoundary: false }
}

// count how many processor boundaries exist in the segments
// useful for whisper-server where we don't know the processor count upfront
export function countProcessorBoundaries(
  segments: RawWhisperSegment[],
): number {
  if (segments.length === 0) return 0

  let boundaryCount = 0
  const state: CorrectionState = {
    cumulativeOffset: 0,
    lastSegmentEnd: 0,
    lastWordEnd: 0,
  }

  for (const segment of segments) {
    const boundary = detectProcessorBoundary(segment, state)
    if (boundary.isBoundary) {
      boundaryCount++
    }

    // time travel correction
    const segmentEnd =
      segment.segmentEnd < segment.segmentStart
        ? segment.segmentStart
        : segment.segmentEnd
    state.lastSegmentEnd = segmentEnd

    const lastWord = segment.words[segment.words.length - 1]
    if (lastWord) {
      state.lastWordEnd = Math.max(state.lastWordEnd, lastWord.end)
    }
  }

  return boundaryCount
}

const MIN_SECONDS_PER_PROCESSOR = 30

export function calculateEffectiveProcessors(
  durationSeconds: number,
  requestedProcessors: number,
): number {
  const maxProcessors = Math.max(
    1,
    Math.floor(durationSeconds / MIN_SECONDS_PER_PROCESSOR),
  )
  return Math.min(requestedProcessors, maxProcessors)
}

function correctWordTimestamps(
  word: RawWhisperWord,
  state: CorrectionState,
  segmentBounds: { start: number; end: number },
): { startTime: number; endTime: number } {
  let startTime = word.start + state.cumulativeOffset
  let endTime = word.end + state.cumulativeOffset

  const duration = endTime - startTime

  // sometimes, at the end or start of splits,
  // whisper.cpp will output words that are much too long (3+ seconds for one word)
  // note: this may break things if the word is actually that long, eg very dramatic speech
  if (duration > MAX_REASONABLE_WORD_DURATION) {
    const reasonableDuration = estimateReasonableDuration(word.text)
    endTime = startTime + reasonableDuration
  }

  // ensure we don't go backwards from the last word
  if (startTime < state.lastWordEnd) {
    const shift = state.lastWordEnd - startTime
    startTime = state.lastWordEnd
    endTime = endTime + shift
  }

  if (endTime < startTime) {
    endTime = startTime
  }

  // cap at segment bounds if they're reasonable
  const segmentDuration = segmentBounds.end - segmentBounds.start
  if (
    segmentDuration > 0 &&
    endTime > segmentBounds.end + state.cumulativeOffset
  ) {
    endTime = Math.max(startTime, segmentBounds.end + state.cumulativeOffset)
  }

  return { startTime, endTime }
}

export interface TimelineCorrectionOptions {
  // known split boundaries from whisper (calculated from audio duration and processor count)
  splitBoundaries?: number[] | undefined
}

const findBestSplit = (
  state: CorrectionState,
  segment: RawWhisperSegment,
  splitBoundaries: number[],
  usedSplits: Set<number>,
) => {
  if (!splitBoundaries.length) return null

  const segmentStart = segment.segmentStart

  const expectedTime = state.lastWordEnd > 0 ? state.lastWordEnd : segmentStart
  let bestSplit: number | null = null

  for (const split of splitBoundaries) {
    if (usedSplits.has(split)) continue
    // look for a split that's close to our expected position or segment start
    if (
      Math.abs(split - expectedTime) < 30 ||
      Math.abs(split - segmentStart) < 30
    ) {
      bestSplit = split
      break
    }
  }

  return bestSplit
}

const getBetterCumulativeOffset = (
  state: CorrectionState,
  segment: RawWhisperSegment,
  splitBoundaries: number[],
  usedSplits: Set<number>,
) => {
  const segmentStart = segment.segmentStart
  const firstWord = segment.words[0]
  const firstWordStart = firstWord?.start ?? 0

  // if we have known split boundaries, use them for accurate offset
  // this is the case in whisper-cpp with turbo mode > 1
  const bestSplit = findBestSplit(state, segment, splitBoundaries, usedSplits)

  if (bestSplit === null) {
    if (state.lastWordEnd > 0) {
      return state.lastWordEnd - firstWordStart
    }

    return segmentStart - firstWordStart
  }

  // use the known split time as the accurate offset
  usedSplits.add(bestSplit)
  return bestSplit - firstWordStart
}

export function extractCorrectedTimeline(
  segments: RawWhisperSegment[],
  options: TimelineCorrectionOptions = {},
): Timeline {
  if (segments.length === 0) return []

  const { splitBoundaries = [] } = options
  const usedSplits = new Set<number>()

  const timeline: TimelineEntry[] = []
  const state: CorrectionState = {
    cumulativeOffset: 0,
    lastSegmentEnd: 0,
    lastWordEnd: 0,
  }

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment) continue
    // handle backwards segment timestamps by using start as anchor
    const segmentStart = segment.segmentStart
    const segmentEnd =
      segment.segmentEnd < segment.segmentStart
        ? segment.segmentStart
        : segment.segmentEnd

    // this should probably happen the other way around: rather than find boundaries and then matching them with the calculated ones, we should find the boundaries using the calculated ones
    // at the moment this has the chance of missing boundary adjustments
    const boundary = detectProcessorBoundary(segment, state)
    if (boundary.isBoundary) {
      state.cumulativeOffset = getBetterCumulativeOffset(
        state,
        segment,
        splitBoundaries,
        usedSplits,
      )
    }

    // check if next segment is time traveling, we should fix this segment then
    const nextSegment = segments[i + 1] ?? null
    if (nextSegment && isTimeTravelingSegment(nextSegment)) {
      // we should take the end of the next segment as the sensible one
      // we can calculate the correct start of the next segment/end of this segment by
      // 1. assuming the next segment is correct (it should be)
      // 2. summing the durations of the words in the next segment, and subtracting that from the end time of the next segment
      const totalLengthOfNextSegment = nextSegment.words.reduce(
        (acc, word) => acc + (word.end - word.start),
        0,
      )
      const resonableStartOfNextSegment =
        nextSegment.segmentEnd - totalLengthOfNextSegment

      nextSegment.segmentStart = resonableStartOfNextSegment
      segment.segmentEnd = resonableStartOfNextSegment

      const totalTime = nextSegment.segmentStart - segmentStart
      // we will just do a time/characters ratio to adjust the words
      const characterCount = segment.text.trim().length
      const secondsPerCharacter = totalTime / characterCount

      let cumulativeStart = segmentStart
      for (let j = 0; j < segment.words.length; j++) {
        const word = segment.words[j]
        if (!word) continue
        word.start = cumulativeStart
        cumulativeStart += word.text.trim().length * secondsPerCharacter
        word.end = cumulativeStart
        timeline.push({
          type: "word",
          text: word.text,
          startTime: word.start,
          endTime: word.end,
          confidence: word.confidence,
        })

        state.lastWordEnd = timeline[timeline.length - 1]?.endTime ?? word.end
      }

      state.lastSegmentEnd = segmentEnd
      continue

      // should correct the words in this segment
    }

    for (const word of segment.words) {
      const trimmedText = word.text.trim()
      if (trimmedText.length === 0) continue
      if (trimmedText.includes("BLANK_AUDIO")) continue

      const { startTime, endTime } = correctWordTimestamps(word, state, {
        start: segmentStart,
        end: segmentEnd,
      })

      // merge sub-word tokens (no leading space) into the previous word,
      // but not for CJK characters which don't use spaces between words
      const lastEntry = timeline[timeline.length - 1]
      const isSubwordContinuation =
        !word.text.startsWith(" ") && !startsWithSpacelessScript(trimmedText)

      if (lastEntry && isSubwordContinuation) {
        lastEntry.text += trimmedText
        // use minimum confidence to preserve low-confidence signals
        if (lastEntry.confidence !== undefined) {
          lastEntry.confidence = Math.min(lastEntry.confidence, word.confidence)
        }

        // after merging, check if duration is reasonable
        const mergedDuration = endTime - lastEntry.startTime
        const mergedConfidence = lastEntry.confidence ?? 1
        if (
          mergedDuration > MAX_REASONABLE_WORD_DURATION &&
          mergedConfidence < LOW_CONFIDENCE_THRESHOLD
        ) {
          // cap the merged entry's duration based on text length
          lastEntry.endTime =
            lastEntry.startTime + estimateReasonableDuration(lastEntry.text)
        } else {
          lastEntry.endTime = endTime
        }
      } else {
        timeline.push({
          type: "word",
          text: trimmedText,
          startTime,
          endTime,
          confidence: word.confidence,
        })
      }

      state.lastWordEnd = timeline[timeline.length - 1]?.endTime ?? endTime
    }

    state.lastSegmentEnd = segmentEnd
  }

  return ensureMonotonicTimeline(timeline)
}

function ensureMonotonicTimeline(timeline: TimelineEntry[]): Timeline {
  if (timeline.length === 0) return []

  // sort by start time to handle any remaining out-of-order entries
  const sorted = [...timeline].sort((a, b) => a.startTime - b.startTime)

  const result: TimelineEntry[] = []
  let lastEndTime = 0

  for (const entry of sorted) {
    let startTime = entry.startTime
    let endTime = entry.endTime

    if (startTime < lastEndTime) {
      const shift = lastEndTime - startTime
      startTime = lastEndTime
      endTime = endTime + shift
    }

    if (endTime < startTime) {
      endTime = startTime
    }

    result.push({
      ...entry,
      startTime,
      endTime,
    })

    lastEndTime = endTime
  }

  return result
}

// quality metrics for testing
export interface TimelineQualityMetrics {
  totalWords: number
  maxWordDuration: number
  averageWordDuration: number
  medianWordDuration: number
  suspiciousTokenCount: number
  suspiciousTokens: Array<{
    text: string
    duration: number
    confidence: number
    startTime: number
  }>
  totalDuration: number
}

const SUSPICIOUS_TOKEN_LENGTH_THRESHOLD = 2 // seconds

export function scoreTimeline(timeline: Timeline): TimelineQualityMetrics {
  if (timeline.length === 0) {
    return {
      totalWords: 0,
      maxWordDuration: 0,
      averageWordDuration: 0,
      medianWordDuration: 0,
      suspiciousTokenCount: 0,
      suspiciousTokens: [],
      totalDuration: 0,
    }
  }

  const durations = timeline.map((entry) => entry.endTime - entry.startTime)
  const sortedDurations = [...durations].sort((a, b) => a - b)

  const suspiciousTokens: TimelineQualityMetrics["suspiciousTokens"] = []

  for (const entry of timeline) {
    const duration = entry.endTime - entry.startTime
    const confidence = entry.confidence ?? 1

    if (
      duration > SUSPICIOUS_TOKEN_LENGTH_THRESHOLD &&
      confidence < LOW_CONFIDENCE_THRESHOLD
    ) {
      suspiciousTokens.push({
        text: entry.text,
        duration,
        confidence,
        startTime: entry.startTime,
      })
    }
  }

  const lastEntry = timeline[timeline.length - 1]
  const totalDuration = lastEntry ? lastEntry.endTime : 0

  const sum = durations.reduce((acc, d) => acc + d, 0)
  const medianIndex = Math.floor(sortedDurations.length / 2)

  return {
    totalWords: timeline.length,
    maxWordDuration: Math.max(...durations),
    averageWordDuration: sum / durations.length,
    medianWordDuration: sortedDurations[medianIndex] ?? 0,
    suspiciousTokenCount: suspiciousTokens.length,
    suspiciousTokens,
    totalDuration,
  }
}

export interface TimelineComparisonResult {
  textSimilarity: number // 0-1, how similar the text content is
  durationDifference: number // absolute difference in total duration
  wordCountDifference: number
  maxDurationDifference: number
  isAcceptable: boolean
}

export function compareTimelines(
  baseline: Timeline,
  test: Timeline,
): TimelineComparisonResult {
  const baselineText = baseline
    .map((e) => e.text)
    .join(" ")
    .toLowerCase()
  const testText = test
    .map((e) => e.text)
    .join(" ")
    .toLowerCase()

  // simple word overlap for text similarity
  const baselineWords = new Set(baselineText.split(/\s+/))
  const testWords = new Set(testText.split(/\s+/))
  const intersection = [...baselineWords].filter((w) => testWords.has(w))
  const union = new Set([...baselineWords, ...testWords])
  const textSimilarity = intersection.length / union.size

  const baselineMetrics = scoreTimeline(baseline)
  const testMetrics = scoreTimeline(test)

  const durationDifference = Math.abs(
    baselineMetrics.totalDuration - testMetrics.totalDuration,
  )
  const wordCountDifference = Math.abs(
    baselineMetrics.totalWords - testMetrics.totalWords,
  )
  const maxDurationDifference = Math.abs(
    baselineMetrics.maxWordDuration - testMetrics.maxWordDuration,
  )

  // acceptable if text is similar and no major timing issues
  const isAcceptable =
    textSimilarity > 0.8 &&
    testMetrics.suspiciousTokenCount === 0 &&
    maxDurationDifference < 2

  return {
    textSimilarity,
    durationDifference,
    wordCountDifference,
    maxDurationDifference,
    isAcceptable,
  }
}
