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
  textContent,
} from "@/epub"
import { getTrackDuration } from "@/audio"
import { TranscriptionResult } from "@/transcribe"
import {
  SentenceRange,
  StorytellerTranscription,
  getChapterDuration,
  getSentenceRanges,
  interpolateSentenceRanges,
} from "./getSentenceRanges"
import { tokenizeSentences } from "./nlp"
import { tagSentences } from "./tagSentences"
import { findBestOffset } from "./findChapterOffset"
import { SyncCache } from "./syncCache"

function createMediaOverlay(
  fileStem: string,
  chapterHref: string,
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
                "@_id": `${fileStem}_overlay`,
                "@_epub:textref": `../${chapterHref}`,
                "@_epub:type": "chapter",
              },
              seq: sentenceRanges.map((sentenceRange) => ({
                ":@": {
                  "@_id": `sentence${sentenceRange.id}`,
                },
                par: [
                  {
                    ":@": {
                      "@_src": `../${chapterHref}#sentence${sentenceRange.id}`,
                    },
                    text: [],
                  },
                  {
                    ":@": {
                      "@_src": `../Audio/${basename(sentenceRange.audiofile)}`,
                      "@_clipBegin": `${sentenceRange.start}s`,
                      "@_clipEnd": `${sentenceRange.end}s`,
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

function getTranscriptionText(transcription: StorytellerTranscription) {
  return transcription.segments.map((segment) => segment.text).join(" ")
}

type SyncedChapter = {
  chapter: ManifestItem
  xml: ParsedXml
  sentenceRanges: SentenceRange[]
}

export class Synchronizer {
  private transcription: StorytellerTranscription

  private totalDuration = 0

  private syncedChapters: SyncedChapter[] = []

  constructor(
    public epub: Epub,
    private syncCache: SyncCache,
    audiofiles: string[],
    transcriptions: TranscriptionResult[],
  ) {
    this.transcription = transcriptions.reduce<StorytellerTranscription>(
      (acc, transcription, index) => ({
        segments: [
          ...acc.segments,
          ...transcription.segments.map((segment) => ({
            ...segment,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            audiofile: audiofiles[index]!,
          })),
        ],
      }),
      { segments: [] },
    )

    this.getChapterSentences = memoize(this.getChapterSentences.bind(this))
  }

  private async getChapterSentences(chapterId: string) {
    const chapterXml = await this.epub.readXhtmlItemContents(chapterId)
    const text = textContent(getBody(chapterXml))

    const sentences = tokenizeSentences(text)
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
            mediaType: "audio/mpeg",
          },
          audio,
        )
      }),
    )

    const { name: chapterStem } = parse(chapter.href)

    const mediaOverlayId = `${chapterStem}_overlay`
    await this.epub.addManifestItem(
      {
        id: mediaOverlayId,
        href: `MediaOverlays/${chapterStem}.smil`,
        mediaType: "application/smil+xml",
      },
      createMediaOverlay(chapterStem, chapter.href, sentenceRanges),
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
        `Failed to sync chapter: could not find chapter with it ${chapterId} in manifest`,
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
      )
    const interpolated = interpolateSentenceRanges(sentenceRanges)
    const tagged = tagSentences(chapterXml)

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
      sentenceRanges: interpolated,
    })

    return {
      lastSentenceRange: interpolated[interpolated.length - 1] ?? null,
      endTranscriptionOffset,
    }
  }

  async syncBook(onProgress?: (progress: number) => void) {
    const spine = await this.epub.getSpineItems()
    const transcriptionText = getTranscriptionText(this.transcription)

    let lastTranscriptionOffset = 0
    let lastSentenceRange: null | SentenceRange = null

    for (let index = 0; index < spine.length; index++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const spineItem = spine[index]!
      console.log(`Syncing chapter #${index}`)

      const chapterId = spineItem.id
      const chapterSentences = await this.getChapterSentences(chapterId)
      const { startSentence, transcriptionOffset } =
        this.syncCache.getChapterIndex(index) ??
        findBestOffset(
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

      console.log("Syncing chapter...")
      ;({ lastSentenceRange, endTranscriptionOffset: lastTranscriptionOffset } =
        await this.syncChapter(
          startSentence,
          chapterId,
          transcriptionOffset,
          lastSentenceRange,
        ))

      onProgress?.(index / spine.length)
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
