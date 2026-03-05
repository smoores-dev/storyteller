import {
  type SegmentationResult,
  WordSequence,
  segmentText,
} from "@echogarden/text-segmentation"

import { Epub, type ParsedXml } from "@storyteller-platform/epub"

import { BLOCKS } from "./semantics.ts"

export async function getXhtmlSegmentation(
  xml: ParsedXml,
  options: { primaryLocale?: Intl.Locale | null },
): Promise<SegmentationResult> {
  const result: SegmentationResult = {
    words: new WordSequence(),
    sentences: [],
    segmentSentenceRanges: [],
  }

  let stagedText = ""

  for (const child of xml) {
    if (Epub.isXmlTextNode(child)) {
      stagedText += child["#text"]
      continue
    }

    const childName = Epub.getXmlElementName(child)

    if (!BLOCKS.includes(childName)) {
      stagedText += Epub.getXhtmlTextContent(Epub.getXmlChildren(child))
      continue
    }

    mergeSegmentations(
      result,
      await segmentText(collapseWhitespace(stagedText), {
        ...(options.primaryLocale && {
          language: options.primaryLocale.language,
        }),
        enableEastAsianPostprocessing: true,
      }),
    )
    stagedText = ""
    mergeSegmentations(
      result,
      await getXhtmlSegmentation(Epub.getXmlChildren(child), options),
    )
  }

  mergeSegmentations(
    result,
    await segmentText(collapseWhitespace(stagedText), {
      ...(options.primaryLocale && {
        language: options.primaryLocale.language,
      }),
      enableEastAsianPostprocessing: true,
    }),
  )
  return result
}

function collapseWhitespace(text: string): string {
  return text.replace(/^\s*/, "").replace(/\s*$/, "").replaceAll(/\s+/g, " ")
}

function mergeSegmentations(
  first: SegmentationResult,
  second: SegmentationResult,
) {
  for (const wordEntry of second.words.entries) {
    first.words.addWord(
      wordEntry.text,
      wordEntry.startOffset,
      wordEntry.isPunctuation,
    )
  }

  first.sentences.push(...second.sentences)
  first.segmentSentenceRanges.push(...second.segmentSentenceRanges)
}
