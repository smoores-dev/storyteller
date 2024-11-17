import { readFile } from "node:fs/promises"
import { basename, dirname, parse, relative } from "node:path/posix"
import memoize from "memoize"
import {
  Epub,
  ManifestItem,
  ParsedXml,
  addLink,
  formatDuration,
  getBody,
} from "@/epub"
import { getTrackDuration } from "@/audio"
import {
  SentenceRange,
  StorytellerTranscription,
  expandEmptySentenceRanges,
  getChapterDuration,
  getSentenceRanges,
  interpolateSentenceRanges,
} from "./getSentenceRanges"
import { tagSentences } from "./tagSentences"
import { SyncCache } from "./syncCache"
import { getXHtmlSentences } from "./getXhtmlSentences"
import type { RecognitionResult } from "echogarden/dist/api/Recognition"
import { findNearestMatch } from "./fuzzy"
import { extname } from "node:path"

const OFFSET_SEARCH_WINDOW_SIZE = 5000

function createMediaOverlay(
  chapter: ManifestItem,
  sentenceRanges: SentenceRange[],
) {
  return [
    {
      ":@": {
        "@_xmlns": "http://www.w3.org/ns/SMIL",
        "@_xmlns:epub": "http://www.idpf.org/2007/ops",
        "@_version": "3.0",
      },
      smil: [
        {
          body: [
            {
              ":@": {
                "@_id": `${chapter.id}_overlay`,
                "@_epub:textref": `../${chapter.href}`,
                "@_epub:type": "chapter",
              },
              seq: sentenceRanges.map((sentenceRange) => ({
                ":@": {
                  "@_id": `${chapter.id}-sentence${sentenceRange.id}`,
                },
                par: [
                  {
                    ":@": {
                      "@_src": `../${chapter.href}#${chapter.id}-sentence${sentenceRange.id}`,
                    },
                    text: [],
                  },
                  {
                    ":@": {
                      "@_src": `../Audio/${basename(sentenceRange.audiofile)}`,
                      "@_clipBegin": `${sentenceRange.start.toFixed(3)}s`,
                      "@_clipEnd": `${sentenceRange.end.toFixed(3)}s`,
                    },
                    audio: [],
                  },
                ],
              })),
            },
          ],
        },
      ],
    },
  ] as unknown as ParsedXml
}

type SyncedChapter = {
  chapter: ManifestItem
  xml: ParsedXml
  sentenceRanges: SentenceRange[]
  startOffset: number
  endOffset: number
}

export function concatTranscriptions(
  transcriptions: Pick<RecognitionResult, "transcript" | "wordTimeline">[],
  audiofiles: string[],
) {
  return transcriptions.reduce<StorytellerTranscription>(
    (acc, transcription, index) => ({
      ...acc,
      transcript: acc.transcript + " " + transcription.transcript,
      wordTimeline: [
        ...acc.wordTimeline,
        ...transcription.wordTimeline.map((entry) => ({
          ...entry,
          startOffsetUtf16:
            (entry.startOffsetUtf16 ?? 0) + acc.transcript.length + 1,
          endOffsetUtf16:
            (entry.endOffsetUtf16 ?? 0) + acc.transcript.length + 1,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          audiofile: audiofiles[index]!,
        })),
      ],
    }),
    { transcript: "", wordTimeline: [] },
  )
}

export class Synchronizer {
  private transcription: StorytellerTranscription

  private totalDuration = 0

  private syncedChapters: SyncedChapter[] = []

  constructor(
    public epub: Epub,
    private syncCache: SyncCache,
    audiofiles: string[],
    transcriptions: Pick<RecognitionResult, "transcript" | "wordTimeline">[],
  ) {
    this.transcription = concatTranscriptions(transcriptions, audiofiles)

    this.getChapterSentences = memoize(this.getChapterSentences.bind(this))
  }

  private findBestOffset(
    epubSentences: string[],
    transcriptionText: string,
    lastMatchOffset: number,
  ) {
    let i = 0
    while (i < transcriptionText.length) {
      let startSentence = 0

      const proposedStartIndex =
        (lastMatchOffset + i) % transcriptionText.length
      const proposedEndIndex =
        (proposedStartIndex + OFFSET_SEARCH_WINDOW_SIZE) %
        transcriptionText.length

      const wrapping = proposedEndIndex < proposedStartIndex
      let endIndex = wrapping ? transcriptionText.length : proposedEndIndex
      let startIndex = proposedStartIndex

      let startSeen: number | null = null
      let endSeen: number | null = null
      for (const synced of this.syncedChapters) {
        if (startSeen !== null && endSeen === synced.startOffset) {
          endSeen = synced.endOffset
        } else {
          startSeen = synced.startOffset
          endSeen = synced.endOffset
        }
        if (startIndex >= startSeen && startIndex < endSeen) {
          startIndex = endSeen
        }
        if (endIndex >= startSeen && endIndex <= endSeen) {
          endIndex = startSeen
        }
      }

      if (startIndex < endIndex) {
        const transcriptionTextSlice: string = transcriptionText.slice(
          startIndex,
          endIndex,
        )

        while (startSentence < epubSentences.length) {
          const queryString = epubSentences
            .slice(startSentence, startSentence + 6)
            .join(" ")

          const firstMatch = findNearestMatch(
            queryString.toLowerCase(),
            transcriptionTextSlice.toLowerCase(),
            Math.max(Math.floor(0.1 * queryString.length), 1),
          )

          if (firstMatch) {
            return {
              startSentence,
              transcriptionOffset:
                (firstMatch.index + startIndex) % transcriptionText.length,
            }
          }

          startSentence += 3
        }
      }

      if (wrapping) {
        i += transcriptionText.length - proposedStartIndex
      } else {
        i += Math.floor(OFFSET_SEARCH_WINDOW_SIZE / 2)
      }
    }

    return { startSentence: 0, transcriptionOffset: null }
  }

  private async getChapterSentences(chapterId: string) {
    const chapterXml = await this.epub.readXhtmlItemContents(chapterId)

    const sentences = getXHtmlSentences(getBody(chapterXml))
    const cleanSentences = sentences.map((sentence) =>
      sentence.replaceAll(/\s+/g, " "),
    )
    return cleanSentences
  }

  private async writeSyncedChapter(syncedChapter: SyncedChapter) {
    const { chapter, sentenceRanges, xml } = syncedChapter

    const audiofiles = Array.from(
      new Set(sentenceRanges.map(({ audiofile }) => audiofile)),
    )

    await Promise.all(
      audiofiles.map(async (audiofile) => {
        const { name, base } = parse(audiofile)
        const ext = extname(base)

        const id = `audio_${name}`

        // Make sure this file hasn't already been added
        // from a previous chapter
        const manifest = await this.epub.getManifest()
        if (id in manifest) return

        const epubAudioFilename = `Audio/${base}`
        const duration = await getTrackDuration(audiofile)
        this.totalDuration += duration

        const audio = await readFile(audiofile)
        await this.epub.addManifestItem(
          {
            id,
            href: epubAudioFilename,
            mediaType: ext === ".mp3" ? "audio/mpeg" : "audio/mp4",
          },
          audio,
        )
      }),
    )

    const { name: chapterStem } = parse(chapter.href)

    const mediaOverlayId = `${chapter.id}_overlay`
    await this.epub.addManifestItem(
      {
        id: mediaOverlayId,
        href: `MediaOverlays/${chapterStem}.smil`,
        mediaType: "application/smil+xml",
      },
      createMediaOverlay(chapter, sentenceRanges),
      "xml",
    )

    await this.epub.updateManifestItem(chapter.id, {
      ...chapter,
      mediaOverlay: mediaOverlayId,
    })

    await this.epub.writeXhtmlItemContents(chapter.id, xml)

    const chapterDuration = getChapterDuration(sentenceRanges)

    await this.epub.addMetadata(
      "meta",
      {
        property: "media:duration",
        refines: `#${mediaOverlayId}`,
      },
      formatDuration(chapterDuration),
    )
  }

  private async syncChapter(
    startSentence: number,
    chapterId: string,
    transcriptionOffset: number,
    lastSentenceRange: SentenceRange | null,
  ) {
    const manifest = await this.epub.getManifest()
    const chapter = manifest[chapterId]
    if (!chapter)
      throw new Error(
        `Failed to sync chapter: could not find chapter with id ${chapterId} in manifest`,
      )
    const chapterXml = await this.epub.readXhtmlItemContents(chapterId)

    const chapterSentences = await this.getChapterSentences(chapterId)

    const { sentenceRanges, transcriptionOffset: endTranscriptionOffset } =
      await getSentenceRanges(
        startSentence,
        this.transcription,
        chapterSentences,
        transcriptionOffset,
        lastSentenceRange,
        (await this.epub.getLanguage()) ?? new Intl.Locale("en-US"),
        new Map(),
      )
    const interpolated = await interpolateSentenceRanges(sentenceRanges)
    const expanded = expandEmptySentenceRanges(interpolated)
    const tagged = tagSentences(chapterId, chapterXml)

    const storytellerStylesheetUrl = relative(
      dirname(chapter.href),
      "Styles/storyteller-readaloud.css",
    )

    addLink(tagged, {
      rel: "stylesheet",
      href: storytellerStylesheetUrl,
      type: "text/css",
    })

    this.syncedChapters.push({
      chapter,
      xml: tagged,
      sentenceRanges: expanded,
      startOffset: transcriptionOffset,
      endOffset: endTranscriptionOffset,
    })

    return {
      lastSentenceRange: expanded[expanded.length - 1] ?? null,
      endTranscriptionOffset,
    }
  }

  async syncBook(onProgress?: (progress: number) => void) {
    const spine = await this.epub.getSpineItems()
    const transcriptionText = this.transcription.transcript

    let lastTranscriptionOffset = 0
    let lastSentenceRange: null | SentenceRange = null

    for (let index = 0; index < spine.length; index++) {
      onProgress?.(index / spine.length)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const spineItem = spine[index]!
      console.log(`Syncing chapter #${index}`)

      const chapterId = spineItem.id
      const chapterSentences = await this.getChapterSentences(chapterId)
      if (chapterSentences.length === 0) {
        console.log(`Chapter #${index} has no text; skipping`)
        continue
      }
      if (
        chapterSentences.length < 2 &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chapterSentences[0]!.split(" ").length < 4
      ) {
        console.log(`Chapter #${index} is fewer than four words; skipping`)
        continue
      }
      const { startSentence, transcriptionOffset } =
        this.syncCache.getChapterIndex(index) ??
        this.findBestOffset(
          chapterSentences,
          transcriptionText,
          lastTranscriptionOffset,
        )

      if (transcriptionOffset === null) {
        console.log(
          `Couldn't find matching transcription for chapter #${index}`,
        )
        await this.syncCache.setChapterIndex(index, {
          startSentence: 0,
          transcriptionOffset: null,
        })
        continue
      }

      console.log(
        `Chapter #${index} best matches transcription at offset ${transcriptionOffset}, starting at sentence ${startSentence}`,
      )

      await this.syncCache.setChapterIndex(index, {
        startSentence,
        transcriptionOffset,
      })
      ;({ lastSentenceRange, endTranscriptionOffset: lastTranscriptionOffset } =
        await this.syncChapter(
          startSentence,
          chapterId,
          transcriptionOffset,
          lastSentenceRange,
        ))
    }

    if (lastSentenceRange) {
      lastSentenceRange.end = await getTrackDuration(
        lastSentenceRange.audiofile,
      )
    }

    for (const syncedChapter of this.syncedChapters) {
      await this.writeSyncedChapter(syncedChapter)
    }

    await this.epub.addMetadata(
      "meta",
      { property: "media:duration" },
      formatDuration(this.totalDuration),
    )
    await this.epub.addMetadata(
      "meta",
      { property: "media:active-class" },
      "-epub-media-overlay-active",
    )
    await this.epub.addManifestItem(
      {
        id: "storyteller_readaloud_styles",
        href: "Styles/storyteller-readaloud.css",
        mediaType: "text/css",
      },
      `
.-epub-media-overlay-active {
  background-color: #ffb;
}
      `,
      "utf-8",
    )
  }
}
