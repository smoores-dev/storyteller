import { type ManifestItem, type ParsedXml } from "@storyteller-platform/epub"

import { type SentenceRange, type WordRange } from "../getSentenceRanges.ts"

export type AlignedChapter = {
  chapter: ManifestItem
  chunk?: number
  xml: ParsedXml
  sentenceRanges: SentenceRange[]
  wordRanges: WordRange[][]
  startOffset: number
  endOffset: number
}

export interface AudioFileContext {
  start: number
  end: number
  filepath: string
}

export interface ChapterReport {
  href: string
  spineIndex: number
  chunk: number
  score: number

  transcriptionOffset: number
  endTranscriptionOffset: number
  // transcriptionContext: {
  //   before: string
  //   after: string
  // }
  // endTranscriptionContext: {
  //   before: string
  //   after: string
  // }

  firstMatchedSentenceId: number
  firstMatchedSentenceContext: {
    prevSentence: string | null
    matchedSentence: string
    nextSentence: string | null
  }

  lastMatchedSentenceId: number
  lastMatchedSentenceContext: {
    prevSentence: string | null
    matchedSentence: string
    nextSentence: string | null
  }

  chapterSentenceCount: number
  alignedSentenceCount: number

  audioFiles: AudioFileContext[]
}

export type UnalignedChapterReason =
  | "too-short"
  | "not-found"
  | "is-nav"
  | "no-text"

export interface UnalignedChapterReport {
  href: string

  reason: Exclude<UnalignedChapterReason, "not-found">
}

export interface UnalignedNotFoundChapterReport {
  href: string
  spineIndex: number
  score: number
  chapterSentenceCount: number

  reason: "not-found"

  start: string
  end: string
}

export interface AudioFileReport {
  filepath: string

  matchedRanges: {
    start: number
    end: number
  }[]

  duration: number
  alignedDuration: number
}

export interface UnalignedAudioFileReport {
  filepath: string
  duration: number
}

export interface Report {
  chapters: ChapterReport[]
  unalignedChapters: (UnalignedChapterReport | UnalignedNotFoundChapterReport)[]
  audioFiles: AudioFileReport[]
  unalignedAudioFiles: UnalignedAudioFileReport[]
}

export function buildAudioFileContexts(
  sentenceRanges: SentenceRange[],
): AudioFileContext[] {
  return sentenceRanges.reduce<AudioFileContext[]>((acc, range) => {
    const existing = acc.find((context) => context.filepath === range.audiofile)
    if (existing) {
      existing.start = Math.min(existing.start, range.start)
      existing.end = Math.max(existing.end, range.end)
      return acc
    }
    acc.push({
      filepath: range.audiofile,
      start: range.start,
      end: range.end,
    })
    return acc
  }, [])
}

export function updateAudioFileReports(
  report: Report,
  audioFiles: AudioFileContext[],
  audioFileDurations: Record<string, number>,
) {
  for (const audioFile of audioFiles) {
    const existing = report.audioFiles.find(
      ({ filepath }) => audioFile.filepath === filepath,
    )
    if (existing) {
      existing.matchedRanges.push({
        start: audioFile.start,
        end: audioFile.end,
      })
      existing.matchedRanges.sort((a, b) => a.start - b.start)
      existing.alignedDuration += audioFile.end - audioFile.start
    } else {
      report.audioFiles.push({
        alignedDuration: audioFile.end - audioFile.start,
        duration: audioFileDurations[audioFile.filepath] ?? 0,
        filepath: audioFile.filepath,
        matchedRanges: [{ start: audioFile.start, end: audioFile.end }],
      })
    }
  }
}
