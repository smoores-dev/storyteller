import { enumerate } from "itertools"

import { type TimelineEntry } from "@storyteller-platform/ghost-story"

import { getTrackDuration } from "../common/ffmpeg.ts"
import { errorAlign } from "../errorAlign/errorAlign.ts"
import { type Alignment } from "../errorAlign/utils.ts"

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
  return entry?.endTime ?? null
}

function getAlignmentsForSentence(sentence: string, alignments: Alignment[]) {
  const result: Alignment[] = []
  let sentenceIndex = 0
  for (const alignment of alignments) {
    if (sentenceIndex === sentence.length) break
    if (alignment.opType !== "INSERT") {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      sentenceIndex += alignment.ref!.length + (sentenceIndex === 0 ? 0 : 1)
    }
    result.push(alignment)
  }
  return result
}

export async function getSentenceRanges(
  startSentence: number,
  endSentence: number,
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

  let chapterTranscriptEndIndex = chapterOffset
  let chapterSentenceIndex = startSentence
  let slugifiedChapterTranscriptWindowStartIndex = 0
  while (chapterSentenceIndex < endSentence) {
    const slugifiedChapterSentenceWindowList: string[] = []

    let sentenceWindowLength = 0
    let i = chapterSentenceIndex
    while (sentenceWindowLength < 5000 && i < sentences.length) {
      const { result: sentence } = await slugify(sentences[i]!, locale)
      slugifiedChapterSentenceWindowList.push(sentence)
      sentenceWindowLength += sentence.length
      i++
    }

    const slugifiedChapterSentenceWindow =
      slugifiedChapterSentenceWindowList.join("-")
    const slugifiedChapterTranscriptWindow = slugifiedChapterTranscript.slice(
      slugifiedChapterTranscriptWindowStartIndex,
      slugifiedChapterTranscriptWindowStartIndex + sentenceWindowLength * 1.2,
    )

    const alignments = errorAlign(
      slugifiedChapterSentenceWindow,
      slugifiedChapterTranscriptWindow,
    )
    let alignmentIndex = 0
    let currentTranscriptWindowIndex = 0
    for (const [i, slugifiedSentence] of enumerate(
      slugifiedChapterSentenceWindowList,
    )) {
      if (!slugifiedSentence) continue
      const sentenceAlignments = getAlignmentsForSentence(
        slugifiedSentence,
        alignments.slice(alignmentIndex),
      )
      const sentenceLengthInSlugifiedTranscript = sentenceAlignments
        .filter((a) => a.opType !== "DELETE")
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .map((a) => a.hyp!)
        .join("-").length

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

      if (start && end !== null) {
        sentenceRanges.push({
          id: i + chapterSentenceIndex,
          start: start.start,
          audiofile: start.audiofile,
          end: end,
        })
      }

      alignmentIndex += sentenceAlignments.length
      currentTranscriptWindowIndex += sentenceLengthInSlugifiedTranscript
      if (
        slugifiedChapterTranscriptWindow[currentTranscriptWindowIndex] === "-"
      ) {
        currentTranscriptWindowIndex++
      }
    }

    chapterSentenceIndex += slugifiedChapterSentenceWindowList.length
    slugifiedChapterTranscriptWindowStartIndex += currentTranscriptWindowIndex
    if (
      slugifiedChapterTranscript[slugifiedChapterTranscriptWindowStartIndex] ===
      "-"
    ) {
      slugifiedChapterTranscriptWindowStartIndex++
    }
  }

  return { sentenceRanges, transcriptionOffset: chapterTranscriptEndIndex }
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
