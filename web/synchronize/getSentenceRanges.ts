import { getTrackDuration } from "@/audio"

import { tokenizeSentences } from "./nlp"
import { findNearestMatch } from "./fuzzy"
import type { TimelineEntry } from "echogarden/dist/utilities/Timeline"

export type StorytellerTimelineEntry = TimelineEntry & {
  audiofile: string
}

export type StorytellerTranscription = {
  transcript: string
  wordTimeline: StorytellerTimelineEntry[]
}

export type SentenceRange = {
  id: number
  start: number
  end: number
  audiofile: string
}

function getSentencesWithOffsets(text: string) {
  const sentences = tokenizeSentences(text)
  const sentencesWithOffsets: string[] = []
  let lastSentenceEnd = 0
  for (const sentence of sentences) {
    const sentenceStart = text.indexOf(sentence, lastSentenceEnd)
    if (sentenceStart > lastSentenceEnd) {
      sentencesWithOffsets.push(text.slice(lastSentenceEnd, sentenceStart))
    }

    sentencesWithOffsets.push(sentence)
    lastSentenceEnd = sentenceStart + sentence.length
  }

  if (text.length > lastSentenceEnd) {
    sentencesWithOffsets.push(text.slice(lastSentenceEnd))
  }

  return sentencesWithOffsets
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
function findStartTimestamp(
  matchStartIndex: number,
  transcription: StorytellerTranscription,
) {
  const entry = transcription.wordTimeline.find(
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
  const entry = transcription.wordTimeline.findLast(
    (entry) => (entry.startOffsetUtf16 ?? 0) < matchEndIndex,
  )
  return entry?.endTime ?? null
}

function getWindowIndexFromOffset(window: string[], offset: number) {
  let index = 0
  while (index < window.length - 1 && offset >= window[index]!.length) {
    offset -= window[index]!.length
    index += 1
  }
  return { index, offset }
}
/* eslint-enable @typescript-eslint/no-non-null-assertion */

function collapseWhitespace(input: string) {
  return input.replaceAll(/\s+/g, " ")
}

export async function getSentenceRanges(
  startSentence: number,
  transcription: StorytellerTranscription,
  sentences: string[],
  chapterOffset: number,
  lastSentenceRange: SentenceRange | null,
  encodingCache: Map<string, string[]>,
) {
  const sentenceRanges: SentenceRange[] = []
  const fullTranscriptionText = transcription.transcript
  const transcriptionText = fullTranscriptionText.slice(chapterOffset)
  const transcriptionSentences = getSentencesWithOffsets(transcriptionText).map(
    (sentence) => sentence.toLowerCase(),
  )

  const sentenceEntries = sentences
    .map((sentence, index) => [index, sentence] as const)
    .filter(
      ([, sentence]) =>
        sentence.replaceAll(/[.-_()[\],/?!@#$%^^&*`~;:='"<>+ˌˈ]/g, "").length >
        3,
    )

  let transcriptionWindowIndex = 0
  let transcriptionWindowOffset = 0
  let lastGoodTranscriptionWindow = 0
  let notFound = 0
  let sentenceIndex = startSentence
  let lastMatchEnd = chapterOffset

  while (sentenceIndex < sentenceEntries.length) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [sentenceId, sentence] = sentenceEntries[sentenceIndex]!

    const transcriptionWindowList = transcriptionSentences.slice(
      transcriptionWindowIndex,
      transcriptionWindowIndex + 10,
    )
    const transcriptionWindow = transcriptionWindowList
      .join("")
      .slice(transcriptionWindowOffset)

    const query = collapseWhitespace(sentence.trim()).toLowerCase()

    const firstMatch = findNearestMatch(
      query,
      transcriptionWindow,
      Math.max(Math.floor(0.25 * query.length), 1),
    )

    if (!firstMatch) {
      sentenceIndex += 1
      notFound += 1
      if (notFound === 3 || sentenceIndex === sentenceEntries.length - 1) {
        transcriptionWindowIndex += 1
        if (transcriptionWindowIndex == lastGoodTranscriptionWindow + 30) {
          transcriptionWindowIndex = lastGoodTranscriptionWindow
          notFound = 0
          continue
        }
        sentenceIndex -= notFound
        notFound = 0
      }
      continue
    }

    const transcriptionOffset = transcriptionSentences
      .slice(0, transcriptionWindowIndex)
      .join("").length

    const startResult = findStartTimestamp(
      firstMatch.index +
        transcriptionOffset +
        transcriptionWindowOffset +
        chapterOffset,
      transcription,
    )
    if (!startResult) {
      sentenceIndex += 1
      continue
    }
    let start = startResult.start
    const audiofile = startResult.audiofile

    const end =
      findEndTimestamp(
        firstMatch.index +
          firstMatch.match.length +
          transcriptionOffset +
          transcriptionWindowOffset +
          chapterOffset,
        transcription,
      ) ?? startResult.end

    if (sentenceRanges.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const previousSentenceRange = sentenceRanges[sentenceRanges.length - 1]!
      const previousAudiofile = previousSentenceRange.audiofile

      if (audiofile === previousAudiofile) {
        if (previousSentenceRange.id === sentenceId - 1) {
          previousSentenceRange.end = start
        }
      } else {
        if (previousSentenceRange.id === sentenceId - 1) {
          const lastTrackDuration = await getTrackDuration(previousAudiofile)
          previousSentenceRange.end = lastTrackDuration
          start = 0
        }
      }
    } else if (lastSentenceRange !== null) {
      if (audiofile === lastSentenceRange.audiofile) {
        lastSentenceRange.end = start
      } else {
        const lastTrackDuration = await getTrackDuration(
          lastSentenceRange.audiofile,
        )
        lastSentenceRange.end = lastTrackDuration
        start = 0
      }
    } else {
      start = 0
    }

    sentenceRanges.push({
      id: sentenceId,
      start,
      end,
      audiofile,
    })

    notFound = 0
    lastMatchEnd =
      firstMatch.index +
      firstMatch.match.length +
      transcriptionOffset +
      transcriptionWindowOffset +
      chapterOffset

    const windowIndexResult = getWindowIndexFromOffset(
      transcriptionWindowList,
      firstMatch.index + firstMatch.match.length + transcriptionWindowOffset,
    )

    transcriptionWindowIndex += windowIndexResult.index
    transcriptionWindowOffset = windowIndexResult.offset

    lastGoodTranscriptionWindow = transcriptionWindowIndex
    sentenceIndex += 1
  }

  return {
    sentenceRanges,
    transcriptionOffset: lastMatchEnd,
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
) {
  const interpolated: SentenceRange[] = []
  const [first, ...rest] = sentenceRanges
  if (!first) return interpolated
  if (first.id !== 0) {
    const count = first.id + 1
    const diff = first.end
    const interpolatedLength = diff / count

    for (let i = 0; i < count; i++) {
      interpolated.push({
        id: i,
        start: first.start + interpolatedLength * i,
        end: first.start + interpolatedLength * (i + 1),
        audiofile: first.audiofile,
      })
    }
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
    // If it does, allocate a quarter second for it and continue
    if (diff <= 0) {
      lastSentenceRange.end = sentenceRange.start - 0.25
      diff = 0.25
    }
    const interpolatedLength = diff / count

    for (let i = 0; i < count; i++) {
      interpolated.push({
        id: lastSentenceRange.id + i + 1,
        start: lastSentenceRange.end + interpolatedLength * i,
        end: lastSentenceRange.end + interpolatedLength * (i + 1),
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
