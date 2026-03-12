import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname as autoDirname, join as autoJoin } from "node:path"
import { basename, dirname, parse, relative } from "node:path/posix"

import memoize from "memoize"
import { type Logger } from "pino"

import { isAudioFile, lookupAudioMime } from "@storyteller-platform/audiobook"
import {
  Epub,
  type ManifestItem,
  type ParsedXml,
} from "@storyteller-platform/epub"
import {
  createAggregator,
  createTiming,
} from "@storyteller-platform/ghost-story"
import { type RecognitionResult } from "@storyteller-platform/ghost-story/recognition"
import { type Mapping } from "@storyteller-platform/transliteration"

import { getTrackDuration } from "../common/ffmpeg.ts"
import { getXhtmlSegmentation } from "../markup/segmentation.ts"

import { findNearestMatch } from "./fuzzy.ts"
import {
  type SentenceRange,
  type StorytellerTranscription,
  expandEmptySentenceRanges,
  getChapterDuration,
  getSentenceRanges,
  interpolateSentenceRanges,
} from "./getSentenceRanges.ts"
import { slugify } from "./slugify.ts"

const OFFSET_SEARCH_WINDOW_SIZE = 5000

type AlignedChapter = {
  chapter: ManifestItem
  xml: ParsedXml
  sentenceRanges: SentenceRange[]
  startOffset: number
  endOffset: number
}

interface AudioFileContext {
  start: number
  end: number
  filepath: string
}

interface ChapterReport {
  href: string

  transcriptionOffset: number
  transcriptionContext: {
    before: string
    after: string
  }

  firstMatchedSentenceId: number
  firstMatchedSentenceContext: {
    prevSentence: string | null
    matchedSentence: string
    nextSentence: string | null
  }

  audioFiles: AudioFileContext[]
}

interface Report {
  chapters: ChapterReport[]
}

export interface AlignOptions {
  reportsPath?: string | null | undefined
  granularity: "sentence" | "word" | null | undefined
  primaryLocale?: Intl.Locale | null | undefined
  logger?: Logger | null | undefined
  onProgress?: ((progress: number) => void) | null | undefined
}

export async function align(
  input: string,
  output: string,
  transcriptionsDir: string,
  audiobookDir: string,
  options: AlignOptions,
) {
  await mkdir(dirname(output), { recursive: true })
  await copyFile(input, output)

  const audiobookFiles = await readdir(audiobookDir).then((filenames) =>
    filenames
      .filter((f) => isAudioFile(f))
      .map((f) => autoJoin(audiobookDir, f)),
  )

  using epub = await Epub.from(output)

  const transcriptions = await readdir(transcriptionsDir)
    .then((filenames) =>
      filenames
        .filter((f) => f.endsWith(".json"))
        .map((f) => autoJoin(transcriptionsDir, f)),
    )
    .then((filepaths) =>
      Promise.all(
        filepaths.map(async (p) => readFile(p, { encoding: "utf-8" })),
      ),
    )
    .then((contents) =>
      contents.map(
        (c) =>
          JSON.parse(c) as Pick<RecognitionResult, "transcript" | "timeline">,
      ),
    )

  const aligner = new Aligner(
    epub,
    audiobookFiles,
    transcriptions,
    options.granularity,
    options.primaryLocale,
    options.logger,
  )

  const timing = await aligner.alignBook(options.onProgress)

  await epub.saveAndClose()

  if (options.reportsPath) {
    await mkdir(autoDirname(options.reportsPath), { recursive: true })

    await writeFile(
      options.reportsPath,
      JSON.stringify(aligner.report, null, 2),
      {
        encoding: "utf-8",
      },
    )
  }

  return timing
}

export class Aligner {
  private transcription: StorytellerTranscription

  private totalDuration = 0

  private alignedChapters: AlignedChapter[] = []

  private timing = createAggregator()

  private granularity: "sentence" | "word"

  public report: Report = {
    chapters: [],
  }

  constructor(
    public epub: Epub,
    audiofiles: string[],
    transcriptions: Pick<RecognitionResult, "transcript" | "timeline">[],
    granularity: "sentence" | "word" | null | undefined,
    private languageOverride?: Intl.Locale | null,
    private logger?: Logger | null,
  ) {
    this.transcription = concatTranscriptions(transcriptions, audiofiles)

    this.getChapterSentences = memoize(this.getChapterSentences.bind(this))

    this.granularity = granularity ?? "sentence"
  }

  private findBestOffset(
    epubSentences: string[],
    transcriptionText: string,
    lastMatchOffset: number,
    mapping: Mapping,
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
      for (const aligned of this.alignedChapters) {
        const alignedStart = mapping.map(aligned.startOffset, -1)
        const alignedEnd = mapping.map(aligned.endOffset, -1)
        if (startSeen !== null && endSeen === alignedStart) {
          endSeen = alignedEnd
        } else {
          startSeen = alignedStart
          endSeen = alignedEnd
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
            .join("-")

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

    const segmentation = await getXhtmlSegmentation(
      Epub.getXhtmlBody(chapterXml),
      {
        primaryLocale: this.languageOverride ?? (await this.epub.getLanguage()),
      },
    )

    return segmentation.sentences.map((s) => s.text)
  }

  private async writeAlignedChapter(alignedChapter: AlignedChapter) {
    const { chapter, sentenceRanges, xml } = alignedChapter

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

        const mediaType = lookupAudioMime(base) ?? undefined
        await this.epub.addManifestItem(
          {
            id,
            href: epubAudioFilename,
            mediaType,
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

    await this.epub.addMetadata({
      type: "meta",
      properties: {
        property: "media:duration",
        refines: `#${mediaOverlayId}`,
      },
      value: Epub.formatSmilDuration(chapterDuration),
    })
  }

  private addChapterReport(
    chapter: ManifestItem,
    chapterSentences: string[],
    sentenceRanges: SentenceRange[],
    startSentence: number,
    transcriptionOffset: number,
  ) {
    this.report.chapters.push({
      href: chapter.href,
      transcriptionOffset,
      transcriptionContext: {
        before: this.transcription.transcript.slice(
          Math.max(0, transcriptionOffset - 30),
          transcriptionOffset,
        ),
        after: this.transcription.transcript.slice(
          transcriptionOffset,
          Math.min(
            transcriptionOffset + 30,
            this.transcription.transcript.length - 1,
          ),
        ),
      },
      firstMatchedSentenceId: startSentence,
      firstMatchedSentenceContext: {
        prevSentence: chapterSentences[startSentence - 1] ?? null,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        matchedSentence: chapterSentences[startSentence]!,
        nextSentence: chapterSentences[startSentence + 1] ?? null,
      },

      audioFiles: sentenceRanges.reduce<AudioFileContext[]>((acc, range) => {
        const existing = acc.find(
          (context) => context.filepath === range.audiofile,
        )
        if (existing) {
          existing.end = range.end
          return acc
        }
        acc.push({
          filepath: range.audiofile,
          start: range.start,
          end: range.end,
        })
        return acc
      }, []),
    })
  }

  private async alignChapter(
    startSentence: number,
    chapterId: string,
    transcriptionOffset: number,
    locale: Intl.Locale,
    lastSentenceRange: SentenceRange | null,
  ) {
    const timing = createTiming()

    timing.start("read contents")
    const manifest = await this.epub.getManifest()
    const chapter = manifest[chapterId]
    if (!chapter)
      throw new Error(
        `Failed to align chapter: could not find chapter with id ${chapterId} in manifest`,
      )
    const chapterXml = await this.epub.readXhtmlItemContents(chapterId)
    timing.end("read contents")

    timing.start("split to sentences")
    const chapterSentences = await this.getChapterSentences(chapterId)
    timing.end("split to sentences")

    timing.start("align sentences")
    const { sentenceRanges, transcriptionOffset: endTranscriptionOffset } =
      await getSentenceRanges(
        startSentence,
        this.transcription,
        chapterSentences,
        transcriptionOffset,
        locale,
        lastSentenceRange,
      )
    timing.end("align sentences")

    timing.start("expand ranges")
    const interpolated = await interpolateSentenceRanges(
      sentenceRanges,
      lastSentenceRange,
    )
    const expanded = expandEmptySentenceRanges(interpolated)
    timing.end("expand ranges")

    const storytellerStylesheetUrl = relative(
      dirname(chapter.href),
      "Styles/storyteller-readaloud.css",
    )

    Epub.addLinkToXhtmlHead(chapterXml, {
      rel: "stylesheet",
      href: storytellerStylesheetUrl,
      type: "text/css",
    })

    this.alignedChapters.push({
      chapter,
      xml: chapterXml,
      sentenceRanges: expanded,
      startOffset: transcriptionOffset,
      endOffset: endTranscriptionOffset,
    })

    this.addChapterReport(
      chapter,
      chapterSentences,
      expanded,
      startSentence,
      transcriptionOffset,
    )

    return {
      lastSentenceRange: expanded[expanded.length - 1] ?? null,
      endTranscriptionOffset,
      timing,
    }
  }

  async alignBook(onProgress?: ((progress: number) => void) | null) {
    const locale =
      this.languageOverride ??
      (await this.epub.getLanguage()) ??
      new Intl.Locale("en-US")

    this.timing.setMetadata("language", locale.toString())
    this.timing.setMetadata("granularity", this.granularity)

    const spine = await this.epub.getSpineItems()
    const manifest = await this.epub.getManifest()
    const { result: transcriptionText, mapping } = await slugify(
      this.transcription.transcript,
      locale,
    )

    let lastTranscriptionOffset = 0
    let lastSentenceRange: null | SentenceRange = null

    for (let index = 0; index < spine.length; index++) {
      onProgress?.(index / spine.length)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const spineItem = spine[index]!

      this.logger?.info(
        `Aligning epub item #${index} : ${basename(spineItem.href)}`,
      )

      const chapterId = spineItem.id
      if (manifest[chapterId]?.properties?.includes("nav")) {
        continue
      }
      const chapterSentences = await this.getChapterSentences(chapterId)
      const slugifiedChapterSentences: string[] = []
      for (const chapterSentence of chapterSentences) {
        slugifiedChapterSentences.push(
          (await slugify(chapterSentence, locale)).result,
        )
      }
      if (chapterSentences.length === 0) {
        this.logger?.info(`Chapter #${index} has no text; skipping`)
        continue
      }
      if (
        chapterSentences.length < 2 &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chapterSentences[0]!.split(" ").length < 4
      ) {
        this.logger?.info(
          `Chapter #${index} is fewer than four words; skipping`,
        )
        continue
      }

      const { startSentence, transcriptionOffset: slugifiedOffset } =
        this.findBestOffset(
          slugifiedChapterSentences,
          transcriptionText,
          mapping.map(lastTranscriptionOffset, -1),
          mapping,
        )

      const transcriptionOffset =
        slugifiedOffset && mapping.invert().map(slugifiedOffset, -1)

      if (transcriptionOffset === null) {
        this.logger?.info(
          `Couldn't find matching transcription for chapter #${index}`,
        )
        continue
      }

      this.logger?.info(
        `Chapter #${index} best matches transcription at offset ${transcriptionOffset}, starting at sentence ${startSentence}`,
      )

      const result = await this.alignChapter(
        startSentence,
        chapterId,
        transcriptionOffset,
        locale,
        lastSentenceRange,
      )

      lastSentenceRange = result.lastSentenceRange
      lastTranscriptionOffset = result.endTranscriptionOffset

      this.timing.add(result.timing.summary())
    }

    if (lastSentenceRange) {
      lastSentenceRange.end = await getTrackDuration(
        lastSentenceRange.audiofile,
      )
    }

    for (const alignedChapter of this.alignedChapters) {
      await this.writeAlignedChapter(alignedChapter)
    }

    await this.epub.addMetadata({
      type: "meta",
      properties: { property: "media:duration" },
      value: Epub.formatSmilDuration(this.totalDuration),
    })
    await this.epub.addMetadata({
      type: "meta",
      properties: { property: "media:active-class" },
      value: "-epub-media-overlay-active",
    })
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

    return this.timing
  }
}

function createMediaOverlay(
  chapter: ManifestItem,
  sentenceRanges: SentenceRange[],
) {
  return [
    Epub.createXmlElement(
      "smil",
      {
        xmlns: "https://www.w3.org/ns/SMIL",
        "xmlns:epub": "http://www.idpf.org/2007/ops",
        version: "3.0",
      },
      [
        Epub.createXmlElement("body", {}, [
          Epub.createXmlElement(
            "seq",
            {
              id: `${chapter.id}_overlay`,
              "epub:textref": `../${chapter.href}`,
              "epub:type": "chapter",
            },
            sentenceRanges.map((sentenceRange) =>
              Epub.createXmlElement(
                "par",
                {
                  id: `${chapter.id}-s${sentenceRange.id}`,
                },
                [
                  Epub.createXmlElement("text", {
                    src: `../${chapter.href}#${chapter.id}-s${sentenceRange.id}`,
                  }),
                  Epub.createXmlElement("audio", {
                    src: `../Audio/${basename(sentenceRange.audiofile)}`,
                    clipBegin: `${sentenceRange.start.toFixed(3)}s`,
                    clipEnd: `${sentenceRange.end.toFixed(3)}s`,
                  }),
                ],
              ),
            ),
          ),
        ]),
      ],
    ),
  ]
}

export function concatTranscriptions(
  transcriptions: Pick<RecognitionResult, "transcript" | "timeline">[],
  audiofiles: string[],
) {
  return transcriptions.reduce<StorytellerTranscription>(
    (acc, transcription, index) => ({
      ...acc,
      transcript: acc.transcript + " " + transcription.transcript,
      timeline: [
        ...acc.timeline,
        ...transcription.timeline.map((entry) => ({
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
    { transcript: "", timeline: [] },
  )
}
