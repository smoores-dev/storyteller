import { enumerate } from "itertools"
import { runes } from "runes2"

import { type TimelineEntry } from "@storyteller-platform/ghost-story"

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
  start: number
  end: number
  audiofile: string
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
function findStartTimestamp(
  matchStartIndex: number,
  transcription: StorytellerTranscription,
) {
  const entry = transcription.timeline.find(
    (entry) => (entry.endOffsetUtf16 ?? 0) > matchStartIndex,
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
  transcription: StorytellerTranscription,
) {
  const entry = transcription.timeline.findLast(
    (entry) => (entry.startOffsetUtf16 ?? 0) < matchEndIndex,
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
    result.push(alignment)
  }
  return {
    alignments: result,
    score: result.some((a) => a.opType === "MATCH") ? score : -1,
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

export async function getSentenceRanges(
  transcription: StorytellerTranscription,
  sentences: string[],
  chapterOffset: number,
  chapterEndOffset: number,
  locale: Intl.Locale,
) {
  const sentenceRanges: SentenceRange[] = []
  const fullTranscript = transcription.transcript
  const chapterTranscript = fullTranscript.slice(
    chapterOffset,
    chapterEndOffset,
  )
  const { result: slugifiedChapterTranscript, mapping: transcriptMapping } =
    await slugify(chapterTranscript, locale)

  const slugifiedChapterSentences: string[] = []
  for (const s of sentences) {
    const { result } = await slugify(s, locale)
    slugifiedChapterSentences.push(result)
  }

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
        lastFoundSentence = chapterSentenceIndex + slice[0] + slice[1] - 1
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
    for (const [j, slugifiedSentence] of enumerate(
      slugifiedChapterSentenceWindowList,
    )) {
      if (!slugifiedSentence) continue
      const { alignments: sentenceAlignments, score } =
        getAlignmentsForSentence(
          slugifiedSentence,
          alignments.slice(alignmentIndex),
        )

      const sentenceLengthInSlugifiedTranscript = sentenceAlignments
        .filter((a) => a.opType !== "DELETE")
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .map((a) => a.hyp!)
        .join("-").length

      if (score > 0) {
        const start = findStartTimestamp(
          chapterOffset +
            transcriptMapping
              .invert()
              .map(
                slugifiedChapterTranscriptWindowStartIndex +
                  currentTranscriptWindowIndex,
                1,
              ),
          transcription,
        )

        chapterTranscriptEndIndex =
          chapterOffset +
          transcriptMapping
            .invert()
            .map(
              slugifiedChapterTranscriptWindowStartIndex +
                currentTranscriptWindowIndex +
                sentenceLengthInSlugifiedTranscript,
              -1,
            )

        const end = findEndTimestamp(chapterTranscriptEndIndex, transcription)

        if (start && end) {
          if (start.audiofile !== end.audiofile) {
            sentenceRanges.push({
              id: j + chapterSentenceIndex + slice[0],
              start: 0,
              audiofile: end.audiofile,
              end: end.end,
            })
          } else {
            sentenceRanges.push({
              id: j + chapterSentenceIndex + slice[0],
              start: start.start,
              audiofile: start.audiofile,
              end: end.end,
            })
          }
        }
      }

      alignmentIndex += sentenceAlignments.length
      currentTranscriptWindowIndex += sentenceLengthInSlugifiedTranscript
      if (
        slugifiedChapterTranscriptWindow[currentTranscriptWindowIndex] === "-"
      ) {
        currentTranscriptWindowIndex++
      }
    }

    chapterSentenceIndex = i
    slugifiedChapterTranscriptWindowStartIndex += currentTranscriptWindowIndex
    if (
      slugifiedChapterTranscript[slugifiedChapterTranscriptWindowStartIndex] ===
      "-"
    ) {
      slugifiedChapterTranscriptWindowStartIndex++
    }
  }

  return {
    sentenceRanges,
    transcriptionOffset: chapterTranscriptEndIndex,
    firstFoundSentence,
    lastFoundSentence,
  }
}

/**
 * Given two sentence ranges, find the trailing gap of the first
 * and the leading gap of the second, and return the larger gap
 * and corresponding audiofile.
 */
async function getLargestGap(
  trailing: SentenceRange,
  leading: SentenceRange,
): Promise<[number, string]> {
  const leadingGap = leading.start
  const trailingGap =
    (await getTrackDuration(trailing.audiofile)) - trailing.end

  if (trailingGap > leadingGap) return [trailingGap, trailing.audiofile]
  return [leadingGap, leading.audiofile]
}

export async function interpolateSentenceRanges(
  sentenceRanges: SentenceRange[],
  lastSentenceRange: SentenceRange | null,
) {
  const interpolated: SentenceRange[] = []
  const [first, ...rest] = sentenceRanges
  if (!first) return interpolated
  if (first.id !== 0) {
    const count = first.id
    const crossesAudioBoundary =
      !lastSentenceRange || first.audiofile !== lastSentenceRange.audiofile
    let diff = crossesAudioBoundary
      ? first.start
      : first.start - lastSentenceRange.end

    // Sometimes the transcription may entirely miss a short sentence.
    // If it does, allocate a short clip for it and continue
    if (!crossesAudioBoundary && diff <= 0) {
      diff = 0.25
      lastSentenceRange.end = first.start - diff
    }
    const interpolatedLength = diff / count
    const start = crossesAudioBoundary ? 0 : lastSentenceRange.end

    for (let i = 0; i < count; i++) {
      interpolated.push({
        id: i,
        start: start + interpolatedLength * i,
        end: start + interpolatedLength * (i + 1),
        audiofile: first.audiofile,
      })
    }

    interpolated.push(first)
  } else {
    rest.unshift(first)
  }
  for (const sentenceRange of rest) {
    if (interpolated.length === 0) {
      interpolated.push(sentenceRange)
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastSentenceRange = interpolated[interpolated.length - 1]!

    const count = sentenceRange.id - lastSentenceRange.id - 1
    if (count === 0) {
      interpolated.push(sentenceRange)
      continue
    }

    const crossesAudioBoundary =
      sentenceRange.audiofile !== lastSentenceRange.audiofile

    // If we missed the first or last sentence of an audio track,
    // assume that it belongs to whichever audio track has a larger
    // gap
    // eslint-disable-next-line prefer-const
    let [diff, audiofile] = crossesAudioBoundary
      ? await getLargestGap(lastSentenceRange, sentenceRange)
      : [sentenceRange.start - lastSentenceRange.end, sentenceRange.audiofile]

    // Sometimes the transcription may entirely miss a short sentence.
    // If it does, allocate a short clip for it and continue
    if (diff <= 0) {
      if (crossesAudioBoundary) {
        const rangeLength = sentenceRange.end - sentenceRange.start
        diff = rangeLength < 0.5 ? rangeLength / 2 : 0.25
        sentenceRange.start = diff
      } else {
        diff = 0.25
        lastSentenceRange.end = sentenceRange.start - diff
      }
    }
    const interpolatedLength = diff / count
    const start = crossesAudioBoundary ? 0 : lastSentenceRange.end

    for (let i = 0; i < count; i++) {
      interpolated.push({
        id: lastSentenceRange.id + i + 1,
        start: start + interpolatedLength * i,
        end: start + interpolatedLength * (i + 1),
        audiofile: audiofile,
      })
    }

    interpolated.push(sentenceRange)
  }

  return interpolated
}

/**
 * Whisper sometimes provides words with no time information,
 * or start and end timestamps that are equal. EpubCheck complains
 * about these, so we nudge them out a bit to make sure that they're
 * not truly equal.
 */
export function expandEmptySentenceRanges(sentenceRanges: SentenceRange[]) {
  const expandedRanges: SentenceRange[] = []
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
