import { getTrackDuration } from "./audio"
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

function findStartTimestamp(
  matchStartIndex: number,
  transcription: StorytellerTranscription,
) {
  let s = 0
  let position = 0
  let segment = transcription.segments[s]!
  let w = 0
  while (true) {
    while (
      position + transcription.segments[s]!.text.length <
      matchStartIndex
    ) {
      // TODO: Is this +1 here just a bad guess?
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

  const startWord = segment.words[w]!

  if ("start" in startWord) {
    return { start: startWord.start, audiofile: segment.audiofile }
  }

  return { start: segment.start, audiofile: segment.audiofile }
}

function findEndTimestamp(
  matchEndIndex: number,
  transcription: StorytellerTranscription,
  transcriptionLength: number,
) {
  let s = transcription.segments.length - 1
  let position = transcriptionLength - 1
  let w = transcription.segments[s]!.words.length - 1
  let segment = transcription.segments[s]!

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
  while (offset >= window[index]!.length) {
    offset -= window[index]!.length
    index += 1
  }
  return index
}

export async function getSentenceRanges(
  startSentence: number,
  transcription: StorytellerTranscription,
  sentences: string[],
  chapterOffset: number,
  lastSentenceRange: SentenceRange | null,
) {
  const sentenceRanges: SentenceRange[] = []
  const transcriptionText =
    getTranscriptionText(transcription).slice(chapterOffset)
  const transcriptionSentences = getSentencesWithOffsets(transcriptionText).map(
    (sentence) => sentence.toLowerCase(),
  )

  let transcriptionWindowIndex = 0
  let lastGoodTranscriptionWindow = 0
  let notFound = 0
  let sentenceIndex = startSentence

  while (sentenceIndex < sentences.length) {
    const sentence = sentences[sentenceIndex]!
    const transcriptionWindowList = transcriptionSentences.slice(
      transcriptionWindowIndex,
      transcriptionWindowIndex + 10,
    )
    const transcriptionWindow = transcriptionWindowList.join("")

    const firstMatch = findNearestMatch(
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
      firstMatch.start + transcriptionOffset + chapterOffset,
      transcription,
    )
    let start = startResult.start
    const audiofile = startResult.audiofile

    const end = findEndTimestamp(
      firstMatch.end + transcriptionOffset + chapterOffset,
      transcription,
      transcriptionText.length,
    )

    if (sentenceRanges.length > 0) {
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
        if (lastSentenceRange.id === sentenceIndex - 1) {
          lastSentenceRange.end = start
        }
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
    transcriptionWindowIndex += getWindowIndexFromOffset(
      transcriptionWindowList,
      firstMatch.start,
    )

    lastGoodTranscriptionWindow = transcriptionWindowIndex
    sentenceIndex += 1
  }

  return sentenceRanges
}

export function interpolateSentenceRanges(sentenceRanges: SentenceRange[]) {
  const interpolated: SentenceRange[] = []
  for (const sentenceRange of sentenceRanges) {
    if (interpolated.length === 0) {
      interpolated.push(sentenceRange)
      continue
    }

    const lastSentenceRange = interpolated[interpolated.length - 1]!

    const count = sentenceRange.id - lastSentenceRange.id - 1
    if (count === 0) {
      interpolated.push(sentenceRange)
      continue
    }

    const diff = sentenceRange.start - lastSentenceRange.end
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
