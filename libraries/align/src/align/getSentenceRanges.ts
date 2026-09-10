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

export type SentenceRange = {
  id: number
  chapterId: string
  start: number
  end: number
  audiofile: string
  interpolated: boolean
}

export type WordRange = {
  id: number
  chapterId: string
  sentenceId: number
  start: number
  end: number
  audiofile: string
  interpolated: boolean
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

  return { alignments, slice: [slice[0] + narrowed[0], slice[0] + narrowed[1]] }
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
          if (start.audiofile !== end.audiofile) {
            sentenceRanges.push({
              id: j + chapterSentenceIndex + slice[0],
              chapterId,
              start: 0,
              audiofile: end.audiofile,
              end: end.end,
              interpolated: false,
            })
          } else {
            sentenceRanges.push({
              id: j + chapterSentenceIndex + slice[0],
              chapterId,
              start: start.start,
              audiofile: start.audiofile,
              end: end.end,
              interpolated: false,
            })
          }
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
                interpolated: false,
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
 * Whisper sometimes provides words with no time information,
 * or start and end timestamps that are equal. EpubCheck complains
 * about these, so we nudge them out a bit to make sure that they're
 * not truly equal.
 */
export function expandEmptySentenceRanges<
  Range extends SentenceRange | WordRange,
>(sentenceRanges: Range[]) {
  const expandedRanges: Range[] = []
  for (const sentenceRange of sentenceRanges) {
    const previousSentenceRange = expandedRanges[expandedRanges.length - 1]
    if (!previousSentenceRange) {
      expandedRanges.push(sentenceRange)
      continue
    }

    const nudged =
      previousSentenceRange.end > sentenceRange.start &&
      previousSentenceRange.audiofile === sentenceRange.audiofile
        ? { ...sentenceRange, start: previousSentenceRange.end }
        : sentenceRange

    const expanded =
      nudged.end <= nudged.start
        ? { ...nudged, end: nudged.start + 0.001 }
        : nudged

    expandedRanges.push(expanded)
  }
  return expandedRanges
}

export async function collapseSentenceRangeGaps(
  sentenceRanges: SentenceRange[],
) {
  const collapsed: SentenceRange[] = []
  for (const [i, sentenceRange] of enumerate(sentenceRanges)) {
    const nextSentence = sentenceRanges[i + 1]
    const prevSentence = sentenceRanges[i - 1]

    const start =
      prevSentence?.audiofile !== sentenceRange.audiofile
        ? 0
        : sentenceRange.start
    const end =
      nextSentence?.audiofile !== sentenceRange.audiofile
        ? await getTrackDuration(sentenceRange.audiofile)
        : nextSentence.start

    collapsed.push({ ...sentenceRange, start, end })
  }

  return collapsed
}

export function getChapterDuration(sentenceRanges: SentenceRange[]) {
  let i = 0
  let duration = 0
  let audiofile: string | null = null
  let start = 0
  let end = 0
  while (i < sentenceRanges.length) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sentenceRange = sentenceRanges[i]!
    if (sentenceRange.audiofile !== audiofile) {
      duration += end - start
      start = sentenceRange.start
      audiofile = sentenceRange.audiofile
    }
    end = sentenceRange.end
    i++
  }
  duration += end - start
  return duration
}
