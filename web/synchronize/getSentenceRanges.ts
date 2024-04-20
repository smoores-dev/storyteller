import { getTrackDuration } from "@/audio"
import { findNearestMatch } from "./fuzzy"
import { tokenizeSentences } from "./nlp"

type SingleWordSegment = {
  word: string
  start?: number
  end?: number
  score?: number
}

type SingleAlignedSegment = {
  start: number
  end: number
  text: string
  audiofile: string
  words: SingleWordSegment[]
}

export type StorytellerTranscription = {
  segments: SingleAlignedSegment[]
}

export type SentenceRange = {
  id: number
  start: number
  end: number
  audiofile: string
}

function getTranscriptionText(transcription: StorytellerTranscription) {
  return transcription.segments.map((segment) => segment.text).join(" ")
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
  let s = 0
  let position = 0
  let segment = transcription.segments[s]!
  let w = 0
  // eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
  while (true) {
    while (
      position + transcription.segments[s]!.text.length <
      matchStartIndex
    ) {
      position += transcription.segments[s]!.text.length + 1
      s += 1
    }

    w = 0
    segment = transcription.segments[s]!
    while (
      w < segment.words.length &&
      position + segment.words[w]!.word.length <= matchStartIndex
    ) {
      position += segment.words[w]!.word.length + 1
      w += 1
    }
    if (w >= segment.words.length) {
      s += 1
      continue
    }
    break
  }

  if (w === 0 && !("start" in segment.words[w]!))
    return { start: segment.start, audiofile: segment.audiofile }

  while (w < segment.words.length && !("start" in segment.words[w]!)) w += 1

  if (w >= segment.words.length) {
    if (s < transcription.segments.length) {
      return {
        start: transcription.segments[s + 1]!.start,
        audiofile: transcription.segments[s + 1]!.audiofile,
      }
    }
    return null
  }

  const startWord = segment.words[w]!

  // We've already made sure that we have a word with a start timestamp
  return { start: startWord.start!, audiofile: segment.audiofile }
}

export function findEndTimestamp(
  matchEndIndex: number,
  transcription: StorytellerTranscription,
  transcriptionLength: number,
) {
  let s = transcription.segments.length - 1
  let position = transcriptionLength - 1
  let w = transcription.segments[s]!.words.length - 1
  let segment = transcription.segments[s]!

  // eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
  while (true) {
    while (position - transcription.segments[s]!.text.length >= matchEndIndex) {
      position -= transcription.segments[s]!.text.length + 1
      s -= 1
    }

    w = transcription.segments[s]!.words.length - 1
    segment = transcription.segments[s]!

    while (
      w >= 0 &&
      position - segment.words[w]!.word.length >= matchEndIndex
    ) {
      position -= segment.words[w]!.word.length + 1
      w -= 1
    }
    if (w < 0) {
      s -= 1
      continue
    }

    break
  }

  const endWord = segment.words[w]!

  if ("end" in endWord) {
    return endWord.end
  }

  return segment.end
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

export async function getSentenceRanges(
  startSentence: number,
  transcription: StorytellerTranscription,
  sentences: string[],
  chapterOffset: number,
  lastSentenceRange: SentenceRange | null,
) {
  const sentenceRanges: SentenceRange[] = []
  const fullTranscriptionText = getTranscriptionText(transcription)
  const transcriptionText = fullTranscriptionText.slice(chapterOffset)
  const transcriptionSentences = getSentencesWithOffsets(transcriptionText).map(
    (sentence) => sentence.toLowerCase(),
  )

  let transcriptionWindowIndex = 0
  let transcriptionWindowOffset = 0
  let lastGoodTranscriptionWindow = 0
  let notFound = 0
  let sentenceIndex = startSentence
  let lastMatchEnd = chapterOffset

  while (sentenceIndex < sentences.length) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sentence = sentences[sentenceIndex]!
    const transcriptionWindowList = transcriptionSentences.slice(
      transcriptionWindowIndex,
      transcriptionWindowIndex + 10,
    )
    const transcriptionWindow = transcriptionWindowList
      .join("")
      .slice(transcriptionWindowOffset)

    const firstMatch = await findNearestMatch(
      sentence.trim().toLowerCase(),
      transcriptionWindow,
      {
        max_l_dist: Math.floor(0.25 * sentence.trim().length),
      },
    )

    if (!firstMatch) {
      sentenceIndex += 1
      notFound += 1
      if (notFound === 3 || sentenceIndex === sentences.length - 1) {
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
      firstMatch.start +
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

    const end = findEndTimestamp(
      firstMatch.end +
        transcriptionOffset +
        transcriptionWindowOffset +
        chapterOffset,
      transcription,
      fullTranscriptionText.length,
    )

    if (sentenceRanges.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const previousSentenceRange = sentenceRanges[sentenceRanges.length - 1]!
      const previousAudiofile = previousSentenceRange.audiofile

      if (audiofile === previousAudiofile) {
        if (previousSentenceRange.id === sentenceIndex - 1) {
          previousSentenceRange.end = start
        }
      } else {
        const lastTrackDuration = await getTrackDuration(previousAudiofile)
        previousSentenceRange.end = lastTrackDuration
        start = 0
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
      id: sentenceIndex,
      start,
      end,
      audiofile,
    })

    notFound = 0
    lastMatchEnd =
      firstMatch.end +
      transcriptionOffset +
      transcriptionWindowOffset +
      chapterOffset

    const windowIndexResult = getWindowIndexFromOffset(
      transcriptionWindowList,
      firstMatch.end + transcriptionWindowOffset,
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

export function interpolateSentenceRanges(sentenceRanges: SentenceRange[]) {
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

    let diff = sentenceRange.start - lastSentenceRange.end
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
        audiofile: lastSentenceRange.audiofile,
      })
    }

    interpolated.push(sentenceRange)
  }

  return interpolated
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
