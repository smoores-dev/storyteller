/** @jsxImportSource @storyteller-platform/epub */

import { basename } from "node:path"

import { type SegmentationResult } from "@echogarden/text-segmentation"
import { enumerate } from "itertools"

import { type ManifestItem } from "@storyteller-platform/epub"

import {
  type RangeState,
  type SentenceRange,
  type WordRange,
} from "../getSentenceRanges.ts"
import { TextFragmentFactory } from "../textFragments.ts"

export const STORYTELLER_VOCABULARY =
  "https://storyteller-platform.gitlab.io/storyteller/docs/vocabulary"

export const SMIL_PREFIX = `storyteller: ${STORYTELLER_VOCABULARY}`

export function stateType(state: RangeState): string {
  return `storyteller:${state}`
}

export const AUDIO_ONLY_TYPE = "storyteller:audio-only"

export type ChapterHole = {
  sentenceId: number
  position: "before" | "after"
  audiofile: string
  start: number
  end: number
}

function holePar(
  chapter: ManifestItem,
  fragment: string,
  id: string,
  hole: { audiofile: string; start: number; end: number },
) {
  return (
    <par id={id} epub:type={AUDIO_ONLY_TYPE}>
      <text src={`../${chapter.href}#${fragment}`} />
      <audio
        src={`../Audio/${encodeURIComponent(basename(hole.audiofile))}`}
        clipBegin={`${hole.start.toFixed(3)}s`}
        clipEnd={`${hole.end.toFixed(3)}s`}
      />
    </par>
  )
}

function holesAround(
  chapter: ManifestItem,
  sentenceId: number,
  fragment: string,
  holes: ChapterHole[],
  position: "before" | "after",
) {
  return holes
    .filter(
      (hole) => hole.sentenceId === sentenceId && hole.position === position,
    )
    .map((hole, index) =>
      holePar(
        chapter,
        fragment,
        `${chapter.id}-s${sentenceId}-${position}${index}`,
        hole,
      ),
    )
}

export function createAudioChapterOverlay(
  chapter: ManifestItem,
  headingId: string,
  holes: { audiofile: string; start: number; end: number }[],
) {
  return (
    <smil
      xmlns="http://www.w3.org/ns/SMIL"
      xmlns:epub="http://www.idpf.org/2007/ops"
      version="3.0"
      epub:prefix={SMIL_PREFIX}
    >
      <body>
        <seq
          id={`${chapter.id}_overlay`}
          epub:textref={`../${chapter.href}`}
          epub:type="chapter"
        >
          {holes.map((hole, index) =>
            holePar(chapter, headingId, `${chapter.id}-a${index}`, hole),
          )}
        </seq>
      </body>
    </smil>
  )
}

export function createMediaOverlay(
  chapter: ManifestItem,
  granularity: "sentence" | "word",
  sentenceRanges: SentenceRange[],
  wordRanges: Map<number, WordRange[]>,
  sentenceIdToBlockFragment: Map<number, string> | null,
  sentenceIdToFragment: Map<number, string>,
  wordIdToFragment: Map<number, Map<number, string>>,
  holes: ChapterHole[] = [],
) {
  const subSequences = sentenceIdToBlockFragment
    ? createTextRangeLargeSequences(
        chapter,
        granularity,
        sentenceRanges,
        wordRanges,
        sentenceIdToBlockFragment,
        sentenceIdToFragment,
        wordIdToFragment,
        holes,
      )
    : createTextRangeSmallSequences(
        chapter,
        granularity,
        sentenceRanges,
        wordRanges,
        sentenceIdToFragment,
        wordIdToFragment,
        holes,
      )

  return (
    <smil
      xmlns="http://www.w3.org/ns/SMIL"
      xmlns:epub="http://www.idpf.org/2007/ops"
      version="3.0"
      epub:prefix={SMIL_PREFIX}
    >
      <body>
        <seq
          id={`${chapter.id}_overlay`}
          epub:textref={`../${chapter.href}`}
          epub:type="chapter"
        >
          {subSequences}
        </seq>
      </body>
    </smil>
  )
}

function createTextRangeLargeSequences(
  chapter: ManifestItem,
  granularity: "sentence" | "word",
  sentenceRanges: SentenceRange[],
  wordRanges: Map<number, WordRange[]>,
  sentenceIdToBlockFragment: Map<number, string>,
  sentenceIdToFragment: Map<number, string>,
  wordIdToFragment: Map<number, Map<number, string>>,
  holes: ChapterHole[],
) {
  const blockStarts = sentenceIdToBlockFragment
    .entries()
    .toArray()
    .toSorted(([a], [b]) => a - b)

  return blockStarts.map(([sentenceId, fragment], index) => {
    const blockEnd =
      index === blockStarts.length - 1
        ? sentenceRanges.length - 1
        : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          blockStarts[index + 1]![0]

    const sentences = sentenceRanges.slice(sentenceId, blockEnd)

    return (
      <seq
        id={`${chapter.id}-b${index}`}
        epub:type="text-range-large"
        epub:textref={`../${chapter.href}#${fragment}`}
      >
        {createTextRangeSmallSequences(
          chapter,
          granularity,
          sentences,
          wordRanges,
          sentenceIdToFragment,
          wordIdToFragment,
          holes,
        )}
      </seq>
    )
  })
}

function createTextRangeSmallSequences(
  chapter: ManifestItem,
  granularity: "sentence" | "word",
  sentenceRanges: SentenceRange[],
  wordRanges: Map<number, WordRange[]>,
  sentenceIdToFragment: Map<number, string>,
  wordIdToFragment: Map<number, Map<number, string>>,
  holes: ChapterHole[],
) {
  return sentenceRanges.flatMap((sentenceRange) => {
    const fragment = sentenceIdToFragment.get(sentenceRange.id) ?? ""
    const before = holesAround(
      chapter,
      sentenceRange.id,
      fragment,
      holes,
      "before",
    )
    const after = holesAround(
      chapter,
      sentenceRange.id,
      fragment,
      holes,
      "after",
    )
    return [...before, ...sentenceElements(sentenceRange), ...after]
  })

  function sentenceElements(sentenceRange: SentenceRange) {
    if (granularity === "sentence" || !wordRanges.has(sentenceRange.id)) {
      return sentenceRange.audioRanges.map((range, index) => (
        <par
          id={
            index === 0
              ? `${chapter.id}-s${sentenceRange.id}`
              : `${chapter.id}-s${sentenceRange.id}-a${index}`
          }
          epub:type={stateType(sentenceRange.state)}
        >
          <text
            src={`../${chapter.href}#${sentenceIdToFragment.get(sentenceRange.id)}`}
          />
          <audio
            src={`../Audio/${encodeURIComponent(basename(range.audiofile))}`}
            clipBegin={`${range.start.toFixed(3)}s`}
            clipEnd={`${range.end.toFixed(3)}s`}
          />
        </par>
      ))
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const words = wordRanges.get(sentenceRange.id)!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const wordToFragment = wordIdToFragment.get(sentenceRange.id)!

    return [
      <seq
        id={`${chapter.id}-s${sentenceRange.id}`}
        epub:type={`text-range-small ${stateType(sentenceRange.state)}`}
        epub:textref={`../${chapter.href}#${sentenceIdToFragment.get(sentenceRange.id)}`}
      >
        {words.map((word) => (
          <par
            id={`${chapter.id}-s${sentenceRange.id}-w${word.id}`}
            epub:type={stateType(word.state)}
          >
            <text src={`../${chapter.href}#${wordToFragment.get(word.id)}`} />
            <audio
              src={`../Audio/${encodeURIComponent(basename(word.audiofile))}`}
              clipBegin={`${word.start.toFixed(3)}s`}
              clipEnd={`${word.end.toFixed(3)}s`}
            />
          </par>
        ))}
      </seq>,
    ]
  }
}

export function buildFragmentMaps(
  sentenceRanges: SentenceRange[],
  wordRanges: WordRange[][],
  sentences: SegmentationResult["sentences"],
  locale: Intl.Locale,
  textRef: "id-fragment" | "text-fragment",
  granularity: "sentence" | "word",
) {
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

  if (textRef === "text-fragment") {
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

      if (granularity === "word") {
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
          const ranges = wordRangeMap.get(range.id)
          const toFragment = wordIdToFragment.get(range.id)
          if (!ranges || !toFragment) continue

          for (const [k, wordRange] of enumerate(ranges)) {
            toFragment.set(
              wordRange.id,
              wordFactory.findMinimalFragment(k + wordRangeIndex),
            )
          }

          wordRangeIndex += ranges.length
        }
      }

      sentenceRangeIndex += block.length
    }
  }

  return {
    sentenceIdToBlockFragment,
    sentenceIdToFragment,
    wordIdToFragment,
    wordRangeMap,
  }
}
