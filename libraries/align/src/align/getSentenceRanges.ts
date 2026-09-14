import { type SegmentationResult } from "@echogarden/text-segmentation"
import { distance } from "fastest-levenshtein"
import { enumerate } from "itertools"
import { runes } from "runes2"

import { type TimelineEntry } from "@storyteller-platform/ghost-story"
import { type Mapping } from "@storyteller-platform/mapping"

import { getTrackDuration } from "../common/ffmpeg.ts"
import { errorAlign } from "../errorAlign/errorAlign.ts"
import { Alignment, type Slice, reversed } from "../errorAlign/utils.ts"

import { slugify } from "./slugify.ts"

export type StorytellerTimelineEntry = TimelineEntry & {
  audiofile: string
}

export type StorytellerTranscription = {
  transcript: string
  timeline: StorytellerTimelineEntry[]
}

export type AudioRange = {
  start: number
  end: number
  audiofile: string
}

export class SentenceRange {
  constructor(
    public readonly id: number,
    public readonly chapterId: string,
    public readonly audioRanges: AudioRange[],
  ) {
    if (audioRanges.length === 0) {
      throw new Error(
        `Sentence ${chapterId}#${id} must have at least one audio range`,
      )
    }
  }

  get first(): AudioRange {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.audioRanges[0]!
  }

  get last(): AudioRange {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.audioRanges.at(-1)!
  }

  get audiofiles(): string[] {
    return Array.from(new Set(this.audioRanges.map((r) => r.audiofile)))
  }

  withAudioRanges(audioRanges: AudioRange[]) {
    return new SentenceRange(this.id, this.chapterId, audioRanges)
  }
}

export type WordRange = {
  id: number
  chapterId: string
  sentenceId: number
  start: number
  end: number
  audiofile: string
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
function findStartTimestamp(matchStartIndex: number, timeline: MappedTimeline) {
  const entry = timeline.find(
    (entry) => entry.mappedEndOffsetUtf16 > matchStartIndex,
  )
  if (!entry) return null
  return {
    start: entry.startTime,
    end: entry.endTime,
    audiofile: entry.audiofile,
  }
}

export function findEndTimestamp(
  matchEndIndex: number,
  timeline: MappedTimeline,
) {
  const entry = timeline.findLast(
    (entry) => entry.mappedStartOffsetUtf16 < matchEndIndex,
  )
  if (!entry) return null
  return {
    start: entry.startTime,
    end: entry.endTime,
    audiofile: entry.audiofile,
  }
}

function getAlignmentsForSentence(sentence: string, alignments: Alignment[]) {
  const result: Alignment[] = []
  let score = Math.floor(sentence.length / 2)
  let sentenceIndex = 0
  for (const alignment of alignments) {
    if (sentenceIndex === sentence.length) break
    if (alignment.opType !== "INSERT") {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      sentenceIndex += alignment.ref!.length + (sentenceIndex === 0 ? 0 : 1)
    }
    if (
      alignment.opType === "DELETE" ||
      (alignment.opType === "INSERT" && sentenceIndex > 0)
    ) {
      score -= (alignment.ref ?? alignment.hyp)!.length + 1
    }
    if (alignment.opType === "SUBSTITUTE") {
      score -= distance(alignment.ref!, alignment.hyp!)
    }
    result.push(alignment)
  }
  return {
    alignments: result,
    score: result.some((a) => a.opType === "MATCH")
      ? score / sentence.length
      : -1,
  }
}

function errorAlignWithNarrowing(
  refSentences: string[],
  hyp: string,
  narrowStart: boolean,
  narrowEnd: boolean,
): { alignments: Alignment[]; slice: Slice } {
  const firstAttempt = errorAlign(refSentences.join("-"), hyp)

  let alignmentIndex = 0
  let firstGood = 0
  if (narrowStart) {
    for (const sentence of refSentences) {
      const { alignments: sentenceAlignments, score } =
        getAlignmentsForSentence(sentence, firstAttempt.slice(alignmentIndex))

      alignmentIndex += sentenceAlignments.length

      if (sentence === "" || score <= 0) {
        firstGood++
      } else {
        break
      }
    }
  }

  const reversedFirstAttempt = firstAttempt.toReversed().map((a) => {
    if (!a.ref) return a
    return new Alignment(
      a.opType,
      a.refSlice,
      a.hypSlice,
      runes(a.ref).toReversed().join(""),
      a.hyp,
      a.leftCompound,
      a.rightCompound,
    )
  })

  let lastGood = 0
  alignmentIndex = 0
  if (narrowEnd) {
    for (const sentence of reversed(refSentences)) {
      const reversedSentence = runes(sentence).toReversed().join("")
      const { alignments: sentenceAlignments, score } =
        getAlignmentsForSentence(
          reversedSentence,
          reversedFirstAttempt.slice(alignmentIndex),
        )

      alignmentIndex += sentenceAlignments.length

      if (sentence === "" || score <= 0) {
        lastGood++
      } else {
        break
      }
    }
  }

  lastGood = refSentences.length - lastGood

  if (firstGood <= 1 && lastGood >= refSentences.length - 2) {
    return {
      alignments: firstAttempt,
      slice: [0, refSentences.length] as Slice,
    }
  }

  const slice: Slice = [
    Math.max(firstGood - 1, 0),
    Math.min(refSentences.length, lastGood + 1),
  ]
  const { alignments, slice: narrowed } = errorAlignWithNarrowing(
    refSentences.slice(...slice),
    hyp,
    narrowStart,
    narrowEnd,
  )

  return {
    alignments,
    slice: [slice[0] + narrowed[0], slice[0] + narrowed[1]],
  }
}

export function mapTranscriptionTimeline(
  transcription: StorytellerTranscription,
  mapping: Mapping,
) {
  const cursor = mapping.cursor()
  return transcription.timeline.map((entry) => ({
    ...entry,
    mappedStartOffsetUtf16: cursor.map(entry.startOffsetUtf16 ?? 0, "end"),
    mappedEndOffsetUtf16: cursor.map(entry.endOffsetUtf16 ?? 0, "start"),
  }))
}

export type MappedTimeline = ReturnType<typeof mapTranscriptionTimeline>

export async function getSentenceRanges(
  transcriptionText: string,
  mappedTimeline: MappedTimeline,
  sentences: SegmentationResult["sentences"],
  chapterId: string,
  chapterOffset: number,
  chapterEndOffset: number,
  granularity: "sentence" | "word",
  locale: Intl.Locale,
) {
  const sentenceRanges: SentenceRange[] = []
  const wordRanges: WordRange[][] = []
  const slugifiedChapterTranscript = transcriptionText.slice(
    chapterOffset,
    chapterEndOffset,
  )

  const slugifiedChapterSentences: string[] = []
  for (const s of sentences) {
    const { result } = await slugify(s.text, locale)
    slugifiedChapterSentences.push(result)
  }

  let totalScore = 0
  let totalSentences = 0

  let firstFoundSentence = 0
  let lastFoundSentence = sentences.length - 1
  let chapterTranscriptEndIndex = chapterOffset
  let chapterSentenceIndex = 0
  let slugifiedChapterTranscriptWindowStartIndex = 0
  while (chapterSentenceIndex < slugifiedChapterSentences.length) {
    let slugifiedChapterSentenceWindowList: string[] = []

    let sentenceWindowLength = 0
    let i = chapterSentenceIndex
    while (
      sentenceWindowLength < 5000 &&
      i < slugifiedChapterSentences.length
    ) {
      const sentence = slugifiedChapterSentences[i]!
      slugifiedChapterSentenceWindowList.push(sentence)
      sentenceWindowLength += sentence.length
      i++
    }

    const remainingSlugifiedSentences = slugifiedChapterSentences.slice(i)
    const remainingSlugifiedSentenceLength = remainingSlugifiedSentences.reduce(
      (acc, s) => acc + s.length,
      0,
    )

    if (remainingSlugifiedSentenceLength < 5000) {
      slugifiedChapterSentenceWindowList.push(...remainingSlugifiedSentences)
      sentenceWindowLength += remainingSlugifiedSentenceLength
      i = slugifiedChapterSentences.length
    }

    const slugifiedChapterTranscriptWindow = slugifiedChapterTranscript.slice(
      slugifiedChapterTranscriptWindowStartIndex,
      slugifiedChapterTranscriptWindowStartIndex + sentenceWindowLength * 1.2,
    )

    let alignments: Alignment[]
    let slice: Slice = [0, slugifiedChapterSentenceWindowList.length - 1]
    if (chapterSentenceIndex === 0 || i === sentences.length) {
      const result = errorAlignWithNarrowing(
        slugifiedChapterSentenceWindowList,
        slugifiedChapterTranscriptWindow,
        chapterSentenceIndex === 0,
        i === sentences.length,
      )
      alignments = result.alignments
      slice = result.slice
      if (chapterSentenceIndex === 0) {
        firstFoundSentence = chapterSentenceIndex + slice[0]
      }
      if (i === sentences.length) {
        lastFoundSentence = chapterSentenceIndex + slice[1] - 1
      }
      slugifiedChapterSentenceWindowList =
        slugifiedChapterSentenceWindowList.slice(...slice)
    } else {
      alignments = errorAlign(
        slugifiedChapterSentenceWindowList.join("-"),
        slugifiedChapterTranscriptWindow,
      )
    }

    let alignmentIndex = 0
    let currentTranscriptWindowIndex = 0
    let lastGoodSentenceIndex = slice[0] - 1
    let lastGoodTranscriptWindowIndex = -1
    for (const [j, slugifiedSentence] of enumerate(
      slugifiedChapterSentenceWindowList,
    )) {
      if (!slugifiedSentence) continue
      const { alignments: sentenceAlignments, score } =
        getAlignmentsForSentence(
          slugifiedSentence,
          alignments.slice(alignmentIndex),
        )

      totalScore += score
      totalSentences += 1

      const sentenceLengthInSlugifiedTranscript = sentenceAlignments
        .filter((a) => a.opType !== "DELETE")
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .map((a) => a.hyp!)
        .join("-").length

      if (score > 0) {
        lastGoodSentenceIndex = j + slice[0]
        const start = findStartTimestamp(
          chapterOffset +
            slugifiedChapterTranscriptWindowStartIndex +
            currentTranscriptWindowIndex,
          mappedTimeline,
        )

        chapterTranscriptEndIndex =
          chapterOffset +
          slugifiedChapterTranscriptWindowStartIndex +
          currentTranscriptWindowIndex +
          sentenceLengthInSlugifiedTranscript

        const end = findEndTimestamp(chapterTranscriptEndIndex, mappedTimeline)

        if (start && end) {
          sentenceRanges.push(
            new SentenceRange(j + chapterSentenceIndex + slice[0], chapterId, [
              start.audiofile !== end.audiofile
                ? { start: 0, audiofile: end.audiofile, end: end.end }
                : {
                    start: start.start,
                    audiofile: start.audiofile,
                    end: end.end,
                  },
            ]),
          )
        }

        if (granularity === "word") {
          const sentenceSegmentation =
            sentences[j + chapterSentenceIndex + slice[0]]!
          const words: string[] = []
          for (const entry of sentenceSegmentation.words.entries) {
            if (!entry.text.match(/\S/)) continue
            const { result } = await slugify(entry.text, locale)
            words.push(result)
          }

          let currentTranscriptWordWindowIndex = currentTranscriptWindowIndex
          let sentenceAlignmentIndex = 0
          const perSentenceWordRanges: WordRange[] = []
          for (const [k, word] of enumerate(words)) {
            if (!word) continue
            const { alignments: wordAlignments } = getAlignmentsForSentence(
              word,
              sentenceAlignments.slice(sentenceAlignmentIndex),
            )
            const wordLengthInSlugifiedTranscript = wordAlignments
              .filter((a) => a.opType !== "DELETE")
              .map((a) => a.hyp!)
              .join("-").length
            const start = findStartTimestamp(
              chapterOffset +
                slugifiedChapterTranscriptWindowStartIndex +
                currentTranscriptWordWindowIndex,
              mappedTimeline,
            )
            const end = findEndTimestamp(
              chapterOffset +
                slugifiedChapterTranscriptWindowStartIndex +
                currentTranscriptWordWindowIndex +
                wordLengthInSlugifiedTranscript,
              mappedTimeline,
            )

            if (start && end) {
              perSentenceWordRanges.push({
                id: k,
                chapterId,
                sentenceId: j + chapterSentenceIndex + slice[0],
                start: end.audiofile === start.audiofile ? start.start : 0,
                audiofile: end.audiofile,
                end: end.end,
              })
            }

            sentenceAlignmentIndex += wordAlignments.length
            currentTranscriptWordWindowIndex += wordLengthInSlugifiedTranscript
            if (
              slugifiedChapterTranscriptWindow[
                currentTranscriptWordWindowIndex
              ] === "-"
            ) {
              currentTranscriptWordWindowIndex++
            }
          }
          wordRanges.push(perSentenceWordRanges)
        }
      }

      alignmentIndex += sentenceAlignments.length
      currentTranscriptWindowIndex += sentenceLengthInSlugifiedTranscript
      if (
        slugifiedChapterTranscriptWindow[currentTranscriptWindowIndex] === "-"
      ) {
        currentTranscriptWindowIndex++
      }
      if (score > 0) {
        lastGoodTranscriptWindowIndex = currentTranscriptWindowIndex
      }
    }

    if (lastGoodSentenceIndex === -1) {
      return {
        sentenceRanges,
        wordRanges,
        transcriptionOffset: chapterTranscriptEndIndex,
        firstFoundSentence,
        lastFoundSentence: Math.max(
          firstFoundSentence,
          chapterSentenceIndex - 1,
        ),
        score: (totalScore / totalSentences) * 100 + 50,
      }
    }
    chapterSentenceIndex += lastGoodSentenceIndex + 1
    slugifiedChapterTranscriptWindowStartIndex += lastGoodTranscriptWindowIndex
    if (
      slugifiedChapterTranscript[slugifiedChapterTranscriptWindowStartIndex] ===
      "-"
    ) {
      slugifiedChapterTranscriptWindowStartIndex++
    }
  }

  return {
    sentenceRanges,
    wordRanges,
    transcriptionOffset: chapterTranscriptEndIndex,
    firstFoundSentence,
    lastFoundSentence,
    score: (totalScore / totalSentences) * 100 + 50,
  }
}

/**
 * Consecutive sentences must not run backwards through the audio. Drop clips that
 * end before the previous sentence's last clip and trim clips that overlap
 * it.
 */
export function enforceMonotonicAudioRanges(
  sentenceRanges: SentenceRange[],
  audiofiles: string[],
) {
  const fileIndex = new Map(audiofiles.map((audiofile, i) => [audiofile, i]))
  const position = (range: AudioRange, time: number) =>
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    [fileIndex.get(range.audiofile)!, time] as const
  const before = (a: readonly [number, number], b: readonly [number, number]) =>
    a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

  let floor: AudioRange | null = null
  return sentenceRanges.map((sentenceRange) => {
    if (!floor) {
      floor = sentenceRange.last
      return sentenceRange
    }
    const floorEnd = position(floor, floor.end)
    const kept: AudioRange[] = []
    for (const range of sentenceRange.audioRanges) {
      if (!before(floorEnd, position(range, range.end))) continue
      kept.push(
        before(position(range, range.start), floorEnd)
          ? { ...range, start: floor.end, audiofile: floor.audiofile }
          : range,
      )
    }
    if (kept.length === 0) {
      kept.push({
        audiofile: floor.audiofile,
        start: floor.end,
        end: floor.end,
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    floor = kept[kept.length - 1]!
    return sentenceRange.withAudioRanges(kept)
  })
}

/**
 * Apply a length-preserving transform to every clip of a list of sentence
 * ranges, in book order, and pack the results back into their sentences. This
 * lets the clip-level helpers below treat a sentence that spans several audio
 * files as a run of consecutive clips.
 */
function mapAudioRanges(
  sentenceRanges: SentenceRange[],
  transform: (ranges: AudioRange[]) => AudioRange[],
) {
  const transformed = transform(
    sentenceRanges.flatMap((sentenceRange) => sentenceRange.audioRanges),
  )
  let cursor = 0
  return sentenceRanges.map((sentenceRange) => {
    const count = sentenceRange.audioRanges.length
    const audioRanges = transformed.slice(cursor, cursor + count)
    cursor += count
    return sentenceRange.withAudioRanges(audioRanges)
  })
}

/**
 * Whisper sometimes provides words with no time information,
 * or start and end timestamps that are equal. EpubCheck complains
 * about these, so we nudge them out a bit to make sure that they're
 * not truly equal.
 */
export function expandEmptyAudioRanges<Range extends AudioRange>(
  ranges: Range[],
) {
  const expandedRanges: Range[] = []
  for (const range of ranges) {
    const previousRange = expandedRanges[expandedRanges.length - 1]
    if (!previousRange) {
      expandedRanges.push(range)
      continue
    }

    const nudged =
      previousRange.end > range.start &&
      previousRange.audiofile === range.audiofile
        ? { ...range, start: previousRange.end }
        : range

    const expanded =
      nudged.end <= nudged.start
        ? { ...nudged, end: nudged.start + 0.001 }
        : nudged

    expandedRanges.push(expanded)
  }
  return expandedRanges
}

export function expandEmptySentenceRanges(sentenceRanges: SentenceRange[]) {
  return mapAudioRanges(sentenceRanges, expandEmptyAudioRanges)
}

export async function collapseSentenceRangeGaps(
  sentenceRanges: SentenceRange[],
) {
  const ranges = sentenceRanges.flatMap(
    (sentenceRange) => sentenceRange.audioRanges,
  )
  const collapsed: AudioRange[] = []
  for (const [i, range] of enumerate(ranges)) {
    const nextRange = ranges[i + 1]
    const prevRange = ranges[i - 1]

    const start = prevRange?.audiofile !== range.audiofile ? 0 : range.start
    const end =
      nextRange?.audiofile !== range.audiofile
        ? await getTrackDuration(range.audiofile)
        : nextRange.start

    collapsed.push({ ...range, start, end })
  }

  return mapAudioRanges(sentenceRanges, () => collapsed)
}

export function getChapterDuration(sentenceRanges: SentenceRange[]) {
  let duration = 0
  let audiofile: string | null = null
  let start = 0
  let end = 0
  for (const sentenceRange of sentenceRanges) {
    for (const range of sentenceRange.audioRanges) {
      if (range.audiofile !== audiofile) {
        duration += end - start
        start = range.start
        audiofile = range.audiofile
      }
      end = range.end
    }
  }
  duration += end - start
  return duration
}
