import { randomUUID } from "node:crypto"
import { createWriteStream, rmSync } from "node:fs"
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import {
  basename as autoBasename,
  dirname as autoDirname,
  extname,
  join as autoJoin,
} from "node:path"
import { basename, dirname, parse, relative } from "node:path/posix"

import { LocalizedString } from "@readium/shared"
import { enumerate, max } from "itertools"
import memoize from "memoize"
import { type Logger } from "pino"
import { ZipFile } from "yazl"

import {
  addLinkToXhtmlHead,
  type Document,
  Epub,
  getXhtmlBody,
  type ManifestItem,
  xmlId,
} from "@storyteller-platform/epub"
import { scratchPath } from "@storyteller-platform/fs"
import {
  createAggregator,
  createTiming,
} from "@storyteller-platform/ghost-story"
import { type RecognitionResult } from "@storyteller-platform/ghost-story/recognition"
import { MediaType } from "@storyteller-platform/media-types"

import { getTrackDuration } from "../common/ffmpeg.ts"
import { parseDom } from "../markup/parseDom.ts"
import { segmentChapter } from "../markup/segmentation.ts"
import { inlineFootnotes, liftText } from "../markup/transform.ts"
import { readTrackSource } from "../process/trackSource.ts"
import {
  generateGuidedNavigationDocuments,
  generateGuidedNavigationManifest,
} from "../readium/guidedNavigation.ts"

import { READALOUD_STYLESHEET, writeAudioChapters } from "./audioChapters.tsx"
import {
  type AlignmentDecisions,
  type ExclusionOptions,
  NO_DECISIONS,
  NO_EXCLUSIONS,
  chapterAligned,
  classifySpine,
} from "./ctc/exclusions.ts"
import { type ChapterHole, createMediaOverlay } from "./ctc/mediaOverlay.tsx"
import {
  type MappedTimeline,
  type SentenceRange,
  type StorytellerTranscription,
  type WordRange,
  expandEmptyAudioRanges,
  expandEmptySentenceRanges,
  getChapterDuration,
  getSentenceRanges,
  mapTranscriptionTimeline,
} from "./getSentenceRanges.ts"
import {
  LEGACY_RANGE_BEHAVIOUR,
  type RangeBehaviour,
  audioChapterSpine,
  collapseRanges,
  planAudioChapters,
  rangeBehaviour,
} from "./holes.ts"
import {
  type SentenceLengths,
  interpolateSentenceRanges,
  slotKey,
} from "./interpolateSentenceRanges.ts"
import { type ReportV4, emptyReport } from "./report-v4.ts"
import { type PendingSpineItem, buildAlignerReport } from "./reportBuilder.ts"
import { findBoundaries } from "./search.ts"
import { slugify } from "./slugify.ts"
import { TextFragmentFactory } from "./textFragments.ts"

function previewOf(sentences: { text: string }[]): string {
  return sentences
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
}

type AlignedChapter = {
  chapter: ManifestItem
  xml: Document
  sentenceRanges: SentenceRange[]
  wordRanges: WordRange[][]
  startOffset: number
  endOffset: number
}

export interface AlignOptions {
  reportsPath?: string | null | undefined
  granularity?: "sentence" | "word" | null | undefined
  textRef?: "id-fragment" | "text-fragment" | null | undefined
  outFormat?: "epub" | "gnp" | null | undefined
  primaryLocale?: Intl.Locale | null | undefined
  logger?: Logger | null | undefined
  onProgress?: ((progress: number) => void) | null | undefined
  signal?: AbortSignal | null | undefined
  gapSeconds?: number | null | undefined
  audioChapterSeconds?: number | null | undefined
  dropUnread?: boolean | null | undefined
  decisions?: AlignmentDecisions | null | undefined
  autoExclude?: boolean | null | undefined
}

export async function align(
  input: string,
  output: string,
  transcriptionsDir: string,
  audiobookDir: string,
  options: AlignOptions,
) {
  const outFormat = options.outFormat ?? "epub"
  const epubPath =
    outFormat === "epub"
      ? scratchPath(
          `storyteller-platform-align-${randomUUID()}`,
          autoBasename(output),
        )
      : input

  using stack = new DisposableStack()
  stack.defer(() => {
    if (outFormat === "epub") {
      try {
        rmSync(autoDirname(epubPath), { recursive: true, force: true })
      } catch {
        // This is a best effort cleanup of a tmp file, it's fine
        // if it fails
      }
    }
  })

  if (outFormat === "epub") {
    await mkdir(autoDirname(epubPath), { recursive: true })
    await copyFile(input, epubPath)
  }

  const audiobookFiles = await readdir(audiobookDir).then((filenames) =>
    filenames
      .filter((f) => MediaType.fromPath(f)?.kind === "audio")
      .map((f) => autoJoin(audiobookDir, f)),
  )

  using epub = await Epub.from(epubPath)

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
    // When we introduced ghost-story, we changed `wordTimeline`
    // to `timeline`. This means that old transcriptions have the
    // wrong shape, so we fix it here.
    .then((transcriptions) => {
      return transcriptions.map((transcription) => {
        if ("wordTimeline" in transcription) {
          return {
            ...transcription,
            timeline:
              transcription.wordTimeline as RecognitionResult["timeline"],
          }
        }
        return transcription
      })
    })

  const aligner = new Aligner(
    epub,
    audiobookFiles,
    transcriptions,
    options.granularity,
    options.textRef,
    options.primaryLocale,
    options.logger,
    options.signal,
    rangeBehaviour(options),
    {
      decisions: options.decisions ?? NO_DECISIONS,
      autoExclude: options.autoExclude ?? true,
    },
  )

  const timing = await aligner.alignBook(options.onProgress)

  if (outFormat === "epub") {
    await epub.saveAndClose()
    await mkdir(autoDirname(output), { recursive: true })
    await copyFile(epubPath, output)
  } else {
    const guidedNavigationDocuments =
      await generateGuidedNavigationDocuments(epub)

    const manifest = generateGuidedNavigationManifest(
      new LocalizedString(
        (await epub.getTitle()) ?? autoBasename(input, extname(input)),
      ),
      guidedNavigationDocuments,
    )

    const tmpArchivePath = scratchPath(
      `storyteller-platform-epub-${randomUUID()}`,
    )

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    const { promise, resolve } = Promise.withResolvers<void>()
    const zipfile = new ZipFile()

    const writeStream = createWriteStream(tmpArchivePath)

    writeStream.on("close", () => {
      resolve()
    })

    await using stack = new AsyncDisposableStack()
    stack.defer(async () => {
      writeStream.close()
      await rm(tmpArchivePath, { force: true })
    })

    zipfile.outputStream.pipe(writeStream)

    zipfile.addBuffer(
      Buffer.from(JSON.stringify(manifest.serialize())),
      "manifest.json",
    )

    for (const doc of guidedNavigationDocuments) {
      const selfLink = doc.links?.findWithRel("self")
      if (!selfLink) continue
      zipfile.addBuffer(
        Buffer.from(JSON.stringify(doc.serialize())),
        selfLink.href,
      )
    }

    zipfile.end()
    await promise

    await cp(tmpArchivePath, output)

    epub.discardAndClose()
  }

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

  private textRef: "id-fragment" | "text-fragment"

  private audioFileDurations: Record<string, number> = {}

  private audiofileTranscripts: Record<string, string> = {}

  public report: ReportV4 = emptyReport("classic")

  private pendingSpine = new Map<number, PendingSpineItem>()

  private chapterScores = new Map<string, number>()

  constructor(
    public epub: Epub,
    private audiofiles: string[],
    transcriptions: Pick<RecognitionResult, "transcript" | "timeline">[],
    granularity: "sentence" | "word" | null | undefined,
    textRef: "id-fragment" | "text-fragment" | null | undefined,
    private languageOverride?: Intl.Locale | null,
    private logger?: Logger | null,
    private abortSignal?: AbortSignal | null,
    private behaviour: RangeBehaviour = LEGACY_RANGE_BEHAVIOUR,
    private exclusions: ExclusionOptions = NO_EXCLUSIONS,
  ) {
    this.transcription = concatTranscriptions(transcriptions, audiofiles)

    audiofiles.forEach((audiofile, index) => {
      this.audiofileTranscripts[audiofile] =
        transcriptions[index]?.transcript ?? ""
    })

    this.getChapterSentences = memoize(this.getChapterSentences.bind(this))

    this.granularity = granularity ?? "sentence"

    this.textRef = textRef ?? "id-fragment"
  }

  private async getChapterSentences(chapterId: string) {
    const chapterXml = await this.epub.readXhtmlItemContents(chapterId)

    const original = parseDom(getXhtmlBody(chapterXml))

    const inlined = inlineFootnotes(original)

    const lifted = liftText(inlined.root)

    const segmentation = await segmentChapter(lifted.result, {
      primaryLocale: this.languageOverride ?? (await this.epub.getLanguage()),
    })

    return segmentation.filter((s) => s.text.match(/\S/))
  }

  private async writeAlignedChapter(
    alignedChapter: AlignedChapter,
    holes: ChapterHole[] = [],
  ) {
    const locale =
      this.languageOverride ??
      (await this.epub.getLanguage()) ??
      new Intl.Locale("en-US")

    const { chapter, sentenceRanges, wordRanges, xml } = alignedChapter
    const sentences = await this.getChapterSentences(chapter.id)

    let sentenceIdToBlockFragment: Map<number, string> | null = null

    const sentenceIdToFragment = new Map(
      sentenceRanges.map((range) => [
        range.id,
        `${range.chapterId}-s${range.id}`,
      ]),
    )

    const wordIdToFragment = new Map<number, Map<number, string>>(
      wordRanges.map((ranges) => [
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ranges[0]!.sentenceId,
        new Map(
          ranges.map((range) => [
            range.id,
            `${range.chapterId}-s${range.sentenceId}-w${range.id}`,
          ]),
        ),
      ]),
    )

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const wordRangeMap = new Map(wordRanges.map((w) => [w[0]!.sentenceId, w]))

    if (this.textRef === "text-fragment") {
      sentenceIdToBlockFragment = new Map()
      const blocks: string[][] = [[]]
      for (const [i, sentence] of enumerate(sentences)) {
        const text = sentence.text
        blocks.at(-1)?.push(text)
        if (text.includes("\n") && i < sentences.length - 1) {
          blocks.push([])
        }
      }

      const blockFactory = new TextFragmentFactory(
        blocks.map((block) => block.join("")),
        locale,
      )

      let sentenceRangeIndex = 0
      for (const [i, block] of enumerate(blocks)) {
        sentenceIdToBlockFragment.set(
          sentenceRangeIndex,
          blockFactory.findMinimalFragment(i),
        )

        const sentenceFactory = new TextFragmentFactory(
          block.map((s) => s.replace("\n", "")),
          locale,
        )

        const blockRanges = sentenceRanges.slice(
          sentenceRangeIndex,
          sentenceRangeIndex + block.length,
        )

        for (const [j, range] of enumerate(blockRanges)) {
          sentenceIdToFragment.set(
            range.id,
            sentenceFactory.findMinimalFragment(j),
          )
        }

        if (this.granularity === "word") {
          const allWords: string[] = []
          for (const range of blockRanges) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const sentence = sentences[range.id]!
            const words: string[] = []
            for (const w of sentence.words.entries) {
              if (w.isPunctuation) {
                const lastWord = words.at(-1)
                if (lastWord === undefined) {
                  continue
                }
                words[words.length - 1] = lastWord + w.text.replace("\n", "")
              } else {
                words.push(w.text)
              }
            }
            allWords.push(...words)
          }

          const wordFactory = new TextFragmentFactory(allWords)

          let wordRangeIndex = 0
          for (const range of blockRanges) {
            const wordRanges = wordRangeMap.get(range.id)
            const toFragment = wordIdToFragment.get(range.id)
            if (!wordRanges || !toFragment) continue

            for (const [k, wordRange] of enumerate(wordRanges)) {
              toFragment.set(
                wordRange.id,
                wordFactory.findMinimalFragment(k + wordRangeIndex),
              )
            }

            wordRangeIndex += wordRanges.length
          }
        }

        sentenceRangeIndex += block.length
      }
    }

    await this.addAudio([
      ...sentenceRanges.flatMap((range) => range.audiofiles),
      ...holes.map(({ audiofile }) => audiofile),
    ])

    const { name: chapterStem } = parse(chapter.href)

    const mediaOverlayId = `${chapter.id}_overlay`
    await this.epub.addManifestItem(
      {
        id: mediaOverlayId,
        href: `MediaOverlays/${chapterStem}.smil`,
        mediaType: MediaType.SMIL.mime,
      },
      this.epub.createXmlDocument(
        createMediaOverlay(
          chapter,
          this.granularity,
          sentenceRanges,
          wordRangeMap,
          sentenceIdToBlockFragment,
          sentenceIdToFragment,
          wordIdToFragment,
          holes,
        ),
      ),
      "xml",
    )

    await this.epub.updateManifestItem(chapter.id, {
      ...chapter,
      mediaOverlay: mediaOverlayId,
    })

    await this.epub.writeXhtmlItemContents(chapter.id, xml)

    const chapterDuration = getChapterDuration(
      [
        ...sentenceRanges.flatMap((range) => range.audioRanges),
        ...holes,
      ].toSorted(
        (a, b) =>
          this.audiofiles.indexOf(a.audiofile) -
            this.audiofiles.indexOf(b.audiofile) || a.start - b.start,
      ),
    )

    await this.epub.addMetadata({
      type: "meta",
      properties: {
        property: "media:duration",
        refines: `#${mediaOverlayId}`,
      },
      value: Epub.formatSmilDuration(chapterDuration),
    })
  }

  private async addAudio(files: string[]) {
    const audiofiles = Array.from(new Set(files))

    await Promise.all(
      audiofiles.map(async (audiofile) => {
        const base = autoBasename(audiofile)

        const epubAudioHref = `Audio/${encodeURIComponent(base)}`

        // Make sure this file hasn't already been added
        // from a previous chapter
        const manifest = await this.epub.getManifest()
        if (
          Object.values(manifest).some((item) => item.href === epubAudioHref)
        ) {
          return
        }

        const id = xmlId()

        const duration = await getTrackDuration(audiofile)
        this.totalDuration += duration

        const audio = await readFile(audiofile)

        const mediaType = MediaType.fromPath(base)?.mime
        await this.epub.addManifestItem(
          {
            id,
            href: epubAudioHref,
            mediaType,
          },
          audio,
        )
      }),
    )
  }

  private markSpine(item: PendingSpineItem) {
    this.pendingSpine.set(item.index, item)
  }

  private async alignChapter(
    chapterId: string,
    transcriptionText: string,
    transcriptionOffset: number,
    transcriptionEndOffset: number,
    locale: Intl.Locale,
    mappedTimeline: MappedTimeline,
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
    const {
      sentenceRanges,
      wordRanges,
      transcriptionOffset: endTranscriptionOffset,
      score,
    } = await getSentenceRanges(
      transcriptionText,
      mappedTimeline,
      chapterSentences,
      chapterId,
      transcriptionOffset,
      transcriptionEndOffset,
      this.granularity,
      locale,
    )
    timing.end("align sentences")

    const storytellerStylesheetUrl = relative(
      dirname(chapter.href),
      "Styles/storyteller-readaloud.css",
    )

    addLinkToXhtmlHead(chapterXml, {
      rel: "stylesheet",
      href: storytellerStylesheetUrl,
      type: MediaType.CSS.mime,
    })

    this.alignedChapters.push({
      chapter,
      xml: chapterXml,
      sentenceRanges,
      wordRanges,
      startOffset: transcriptionOffset,
      endOffset: endTranscriptionOffset,
    })

    this.chapterScores.set(chapterId, score)

    return {
      matched: sentenceRanges.length > 0,
      endTranscriptionOffset,
      timing,
    }
  }

  narrowToAvailableBoundary(boundary: { start: number; end: number }) {
    const available: number[] = [
      -1,
      ...this.alignedChapters
        .toSorted((a, b) => a.startOffset - b.startOffset)
        .flatMap(({ startOffset, endOffset }) => [startOffset, endOffset]),
      Infinity,
    ]

    const withinBoundary: [number, number][] = []
    for (let i = 0; i < available.length - 1; i += 2) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [start, end] = [available[i]!, available[i + 1]!]
      if (
        (boundary.start <= start && boundary.end >= start) ||
        (boundary.start <= end && boundary.end >= end)
      ) {
        withinBoundary.push([
          Math.max(boundary.start, start + 1),
          Math.min(boundary.end, end - 1),
        ])
      }
    }

    const largestBoundary = max(withinBoundary, ([start, end]) => end - start)

    if (!largestBoundary) return { start: boundary.start, end: boundary.end }

    return { start: largestBoundary[0], end: largestBoundary[1] }
  }

  async alignBook(onProgress?: ((progress: number) => void) | null) {
    const locale =
      this.languageOverride ??
      (await this.epub.getLanguage()) ??
      new Intl.Locale("en-US")

    this.timing.setMetadata("language", locale.toString())
    this.timing.setMetadata("granularity", this.granularity)

    for (const audiofile of this.audiofiles) {
      this.audioFileDurations[audiofile] = await getTrackDuration(audiofile)
    }

    const spine = await this.epub.getSpineItems()
    const classifications = await classifySpine(this.epub, { locale })
    const { result: transcriptionText, mapping } = await slugify(
      this.transcription.transcript,
      locale,
    )

    const mappedTimeline = mapTranscriptionTimeline(this.transcription, mapping)

    for (let index = 0; index < spine.length; index++) {
      this.abortSignal?.throwIfAborted()
      onProgress?.(index / spine.length)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const spineItem = spine[index]!

      this.logger?.info(
        `Aligning epub item #${index} : ${basename(spineItem.href)}`,
      )

      const chapterId = spineItem.id
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const classification = classifications[index]!
      const decision =
        this.exclusions.decisions.chapters[spineItem.href] ?? null
      const { zone, verdict, decidedBy, signals } = classification
      const reported = { zone, verdict, decidedBy, signals }
      const mark = (
        status: PendingSpineItem["status"],
        sentenceCount: number,
        preview: string | null,
      ) => {
        this.markSpine({
          index,
          href: spineItem.href,
          chapterId,
          title: null,
          status,
          classification: reported,
          decision,
          sentenceCount,
          preview,
        })
      }
      if (
        !chapterAligned(classification, decision, this.exclusions.autoExclude)
      ) {
        mark("excluded", 0, null)
        continue
      }
      const chapterSentences = await this.getChapterSentences(chapterId)
      const slugifiedChapterSentences: string[] = []
      for (const chapterSentence of chapterSentences) {
        slugifiedChapterSentences.push(
          (await slugify(chapterSentence.text, locale)).result,
        )
      }
      if (chapterSentences.length === 0) {
        this.logger?.info(`Chapter #${index} has no text; skipping`)
        const noText = {
          source: "no-text",
          value: "",
          verdict: "exclude",
        } as const
        this.markSpine({
          index,
          href: spineItem.href,
          chapterId,
          title: null,
          status: "excluded",
          classification: {
            ...reported,
            verdict: "exclude",
            decidedBy: noText,
            signals: signals.some((s) => s.source === "no-text")
              ? signals
              : [...signals, noText],
          },
          decision,
          sentenceCount: 0,
          preview: null,
        })
        continue
      }
      if (
        chapterSentences.length < 2 &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chapterSentences[0]!.words.length < 4
      ) {
        this.logger?.info(
          `Chapter #${index} is fewer than four words; skipping`,
        )
        mark("too-short", chapterSentences.length, previewOf(chapterSentences))
        continue
      }

      const boundaries = findBoundaries(
        slugifiedChapterSentences.join("-"),
        transcriptionText,
      )

      if (!boundaries) {
        this.logger?.info(
          `Could not find chapter #${index} in the transcripton`,
        )
        mark(
          "not-found",
          chapterSentences.length,
          previewOf([
            ...chapterSentences.slice(0, 3),
            ...chapterSentences.slice(-3),
          ]),
        )
        continue
      }

      const { start, end } = this.narrowToAvailableBoundary(boundaries)
      if (start === end) {
        mark(
          "not-found",
          chapterSentences.length,
          previewOf([
            ...chapterSentences.slice(0, 3),
            ...chapterSentences.slice(-3),
          ]),
        )
        continue
      }

      const result = await this.alignChapter(
        chapterId,
        transcriptionText,
        Math.max(start, 0),
        Math.min(end, transcriptionText.length),
        locale,
        mappedTimeline,
      )

      this.timing.add(result.timing.summary())
      mark(
        result.matched ? "aligned" : "not-found",
        chapterSentences.length,
        result.matched
          ? null
          : previewOf([
              ...chapterSentences.slice(0, 3),
              ...chapterSentences.slice(-3),
            ]),
      )
    }

    const audioOrderedChapters = this.alignedChapters.toSorted((a, b) => {
      const firstRangeA = a.sentenceRanges[0]
      const firstRangeB = b.sentenceRanges[0]
      if (!firstRangeA) return 1
      if (!firstRangeB) return -1
      const firstAudiofileIndexA = this.audiofiles.indexOf(
        firstRangeA.first.audiofile,
      )
      const firstAudiofileIndexB = this.audiofiles.indexOf(
        firstRangeB.first.audiofile,
      )
      if (firstAudiofileIndexA === firstAudiofileIndexB) {
        return firstRangeA.first.start - firstRangeB.first.start
      }
      return firstAudiofileIndexA - firstAudiofileIndexB
    })

    const sentenceRanges: SentenceRange[] = []
    const chapterSentenceCounts: Record<string, number> = {}
    const sentenceLengths: SentenceLengths = {}

    for (const alignedChapter of audioOrderedChapters) {
      sentenceRanges.push(...alignedChapter.sentenceRanges)

      const sentences = await this.getChapterSentences(
        alignedChapter.chapter.id,
      )
      chapterSentenceCounts[alignedChapter.chapter.id] = sentences.length

      for (const [id, sentence] of enumerate(sentences)) {
        sentenceLengths[slotKey({ chapterId: alignedChapter.chapter.id, id })] =
          sentence.text.length
      }
    }

    const interpolated = interpolateSentenceRanges(
      sentenceRanges,
      chapterSentenceCounts,
      this.audioFileDurations,
      sentenceLengths,
      { dropUnread: this.behaviour.dropUnread },
    )

    const expanded = expandEmptySentenceRanges(interpolated)
    const { ranges: collapsed, holes } = collapseRanges(
      expanded,
      this.audiofiles,
      this.audioFileDurations,
      this.behaviour,
    )

    const sources = new Map(
      await Promise.all(
        this.audiofiles.map(
          async (file) => [file, await readTrackSource(file)] as const,
        ),
      ),
    )
    const spineEntries = audioChapterSpine(this.pendingSpine.values())
    const { chapters, remaining } = planAudioChapters(
      holes,
      this.behaviour,
      this.audioFileDurations,
      {
        trackTitle: (file) => sources.get(file)?.title ?? null,
        chapterTitle: spineEntries.chapterTitle,
        excludedBetween: spineEntries.excludedBetween,
      },
    )

    const holesByChapter = new Map<string, ChapterHole[]>()
    for (const hole of remaining) {
      const list = holesByChapter.get(hole.anchor.chapterId) ?? []
      list.push({
        sentenceId: hole.anchor.sentenceId,
        position: hole.anchor.position,
        audiofile: hole.audiofile,
        start: hole.start,
        end: hole.end,
      })
      holesByChapter.set(hole.anchor.chapterId, list)
    }

    let collapsedStart = 0
    for (const alignedChapter of audioOrderedChapters) {
      const sentences = await this.getChapterSentences(
        alignedChapter.chapter.id,
      )
      const finalSentenceRanges = collapsed.slice(
        collapsedStart,
        collapsedStart + sentences.length,
      )
      alignedChapter.sentenceRanges = finalSentenceRanges
      for (const [i, wordRanges] of enumerate(alignedChapter.wordRanges)) {
        alignedChapter.wordRanges[i] = expandEmptyAudioRanges(wordRanges)
      }
      await this.writeAlignedChapter(
        alignedChapter,
        holesByChapter.get(alignedChapter.chapter.id) ?? [],
      )
      collapsedStart += sentences.length
    }

    const audioChapters = await writeAudioChapters(
      this.epub,
      chapters,
      this.languageOverride ??
        (await this.epub.getLanguage()) ??
        new Intl.Locale("en-US"),
    )
    await this.addAudio(
      audioChapters.flatMap((chapter) =>
        chapter.holes.map((hole) => hole.audiofile),
      ),
    )

    const finalSpine = await this.epub.getSpineItems()
    this.report = await buildAlignerReport({
      aligner: "classic",
      autoExclude: this.exclusions.autoExclude,
      audiofiles: this.audiofiles,
      durations: this.audioFileDurations,
      sources,
      spineIndex: new Map(finalSpine.map((item, i) => [item.id, i])),
      pending: this.pendingSpine.values(),
      ranges: collapsed,
      holes: remaining,
      audioChapters,
      excludedAudio: [],
      sentenceScore: (chapterId) => this.chapterScores.get(chapterId) ?? null,
      chapterSentences: (chapterId) => this.getChapterSentences(chapterId),
    })

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
        href: READALOUD_STYLESHEET,
        mediaType: MediaType.CSS.mime,
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
