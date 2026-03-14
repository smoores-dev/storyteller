import { copyFile } from "node:fs/promises"
import { basename } from "node:path/posix"

import { type SegmentationResult } from "@echogarden/text-segmentation"
import { type Logger } from "pino"

import {
  type ElementName,
  Epub,
  type ParsedXml,
  type XmlElement,
  type XmlNode,
} from "@storyteller-platform/epub"
import {
  type TimingAggregator,
  createAggregator,
  createTiming,
} from "@storyteller-platform/ghost-story"

import { getXhtmlSegmentation } from "./segmentation.ts"
import { BLOCKS } from "./semantics.ts"

export interface MarkupOptions {
  granularity?: "word" | "sentence"
  primaryLocale?: Intl.Locale
  onProgress?: (progress: number) => void
  logger?: Logger
}

export async function markup(
  input: string,
  output: string,
  options: MarkupOptions,
): Promise<TimingAggregator> {
  const timing = createAggregator()
  timing.setMetadata("granularity", options.granularity ?? "sentence")

  await copyFile(input, output)

  using epub = await Epub.from(output)

  const primaryLocale = options.primaryLocale ?? (await epub.getLanguage())

  const spine = await epub.getSpineItems()
  const manifest = await epub.getManifest()

  for (let index = 0; index < spine.length; index++) {
    options.onProgress?.(index / spine.length)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const spineItem = spine[index]!

    options.logger?.info(
      `Marking up epub item #${index}: ${basename(spineItem.href)}`,
    )

    const chapterId = spineItem.id
    if (manifest[chapterId]?.properties?.includes("nav")) {
      continue
    }

    const chapterXml = await epub.readXhtmlItemContents(chapterId)

    const segmentation = await getXhtmlSegmentation(
      Epub.getXhtmlBody(chapterXml),
      { primaryLocale: primaryLocale },
    )

    const { markedUp, timing: chapterTiming } = markupChapter(
      chapterId,
      chapterXml,
      segmentation,
    )
    timing.add(chapterTiming.summary())

    await epub.writeXhtmlItemContents(chapterId, markedUp)
  }

  await epub.saveAndClose()

  return timing
}

export function markupChapter(
  chapterId: string,
  chapterXml: ParsedXml,
  segmentation: SegmentationResult,
) {
  const timing = createTiming()
  const html = Epub.findXmlChildByName("html", chapterXml)
  if (!html) throw new Error("Invalid XHTML document: no html element")

  const body = Epub.findXmlChildByName("body", html["html"])
  if (!body) throw new Error("Invalid XHTML document: No body element")

  clearBodyElement(chapterXml)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const taggedHtml = Epub.findXmlChildByName("html", chapterXml)!

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const taggedBody = Epub.findXmlChildByName("body", taggedHtml["html"])!
  taggedBody["body"] = []

  timing.time("mark up", () => {
    markupBySegmentation(
      chapterId,
      {
        currentSentenceIndex: 0,
        currentNodeProgress: 0,
        currentSentenceProgress: 0,
      },
      segmentation,
      body,
      new Set(),
      [],
      Epub.getXmlChildren(taggedBody),
    )
  })

  return { markedUp: chapterXml, timing }
}

type Mark = {
  elementName: ElementName
  attributes: Record<string, string> | undefined
}
type TagState = {
  currentSentenceIndex: number
  currentSentenceProgress: number
  currentNodeProgress: number
}

function markupBySegmentation(
  chapterId: string,
  state: TagState,
  segmentation: SegmentationResult,
  currentNode: XmlNode,
  taggedSentences: Set<number>,
  marks: Mark[],
  taggedXml: ParsedXml,
): TagState {
  if (Epub.isXmlTextNode(currentNode)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const remainingSentence = segmentation.sentences[
      state.currentSentenceIndex
    ]!.text.slice(state.currentSentenceProgress)

    const text = currentNode["#text"]
    const remainingNodeText = text.slice(state.currentNodeProgress)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const index = remainingNodeText.indexOf(remainingSentence[0]!)

    if (index === -1) {
      appendTextNode(
        chapterId,
        taggedXml,
        remainingNodeText,
        marks,
        taggedSentences,
      )

      return {
        ...state,
        currentNodeProgress: -1,
      }
    }

    if (remainingNodeText.slice(index).length < remainingSentence.length) {
      appendTextNode(
        chapterId,
        taggedXml,
        remainingNodeText.slice(0, index),
        marks,
        taggedSentences,
      )

      appendTextNode(
        chapterId,
        taggedXml,
        remainingNodeText.slice(index),
        marks,
        taggedSentences,
        state.currentSentenceIndex,
      )

      return {
        ...state,
        currentSentenceProgress:
          state.currentSentenceProgress + remainingNodeText.length - index,
        currentNodeProgress: -1,
      }
    }

    appendTextNode(
      chapterId,
      taggedXml,
      remainingNodeText.slice(0, index),
      marks,
      taggedSentences,
    )

    appendTextNode(
      chapterId,
      taggedXml,
      remainingSentence,
      marks,
      taggedSentences,
      state.currentSentenceIndex,
    )

    // If we've just appended the very last sentence, make sure that we also
    // add back the remainder of this text node (which should be whitespace).
    if (state.currentSentenceIndex + 1 === segmentation.sentences.length) {
      appendTextNode(
        chapterId,
        taggedXml,
        remainingNodeText.slice(index + remainingSentence.length),
        marks,
        taggedSentences,
      )
    }

    const mapping = mapWhitespace(remainingNodeText)
    const mapped = mapThrough(
      remainingSentence.length,
      mapping.filter(([start]) => start >= index),
    )

    return {
      currentSentenceIndex: state.currentSentenceIndex + 1,
      currentSentenceProgress: 0,
      currentNodeProgress: state.currentNodeProgress + mapped + index,
    }
  }

  let nextState = {
    ...state,
  }

  const children = Epub.getXmlChildren(currentNode)

  for (const child of children) {
    if (nextState.currentSentenceIndex > segmentation.sentences.length + 1) {
      taggedXml.push(child)
      continue
    }

    nextState.currentNodeProgress = 0

    let nextTaggedXml = taggedXml

    const nextMarks = [...marks]

    if (!Epub.isXmlTextNode(child)) {
      const childTagName = Epub.getXmlElementName(child)

      const isTextContent = BLOCKS.includes(childTagName.toLowerCase())

      if (Epub.getXmlChildren(child).length === 0) {
        appendLeafNode(
          chapterId,
          taggedXml,
          child,
          nextMarks,
          taggedSentences,
          isTextContent || nextState.currentSentenceProgress === 0
            ? undefined
            : nextState.currentSentenceIndex,
        )
        continue
      }

      if (isTextContent) {
        const block: XmlElement = {
          [childTagName]: [],
          ...(child[":@"] && { ":@": child[":@"] }),
        }
        nextTaggedXml.push(block)
        nextTaggedXml = Epub.getXmlChildren(block)
      } else {
        nextMarks.push({
          elementName: childTagName,
          attributes: child[":@"],
        })
      }
    }

    while (
      nextState.currentSentenceIndex < segmentation.sentences.length &&
      nextState.currentNodeProgress !== -1
    ) {
      nextState = markupBySegmentation(
        chapterId,
        nextState,
        segmentation,
        child,
        taggedSentences,
        nextMarks,
        nextTaggedXml,
      )
    }
  }

  nextState.currentNodeProgress = -1
  return nextState
}

function mapWhitespace(text: string) {
  const re = /(\s\s+)/g

  const mapping: [number, number, number][] = []

  let match: RegExpExecArray | null = null
  while ((match = re.exec(text)) !== null) {
    mapping.push([match.index, match[0].length, 1])
  }

  return mapping
}

function mapThrough(position: number, mapping: [number, number, number][]) {
  let result = position
  let index = 0
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  while (index < mapping.length && mapping[index]![0] < result) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const map = mapping[index]!
    result += map[1] - map[2]
    index++
  }
  return result
}

export function appendTextNode(
  chapterId: string,
  xml: ParsedXml,
  text: string,
  marks: Mark[],
  taggedSentences: Set<number>,
  sentenceId?: number,
) {
  if (text.length === 0) return

  const textNode = { "#text": text }

  appendLeafNode(chapterId, xml, textNode, marks, taggedSentences, sentenceId)
}

function appendLeafNode(
  chapterId: string,
  xml: ParsedXml,
  node: XmlNode,
  marks: Mark[],
  taggedSentences: Set<number>,
  sentenceId?: number,
) {
  const tagId = `${chapterId}-s${sentenceId}`

  const markedNode = [...marks].reverse().reduce<XmlElement>(
    (acc, mark) =>
      ({
        [mark.elementName]: [acc],
        ":@": mark.attributes,
      }) as XmlElement,
    node,
  )

  const lastNode = xml[xml.length - 1]
  if (
    lastNode &&
    !Epub.isXmlTextNode(lastNode) &&
    lastNode[":@"]?.["@_id"] &&
    lastNode[":@"]["@_id"] === tagId
  ) {
    const tagName = Epub.getXmlElementName(lastNode)
    lastNode[tagName]?.push(markedNode)
    return
  }

  if (sentenceId === undefined || taggedSentences.has(sentenceId)) {
    xml.push(markedNode)
    return
  }

  const taggedNode = {
    span: [markedNode],
    ":@": { "@_id": tagId },
  }

  taggedSentences.add(sentenceId)
  xml.push(taggedNode)
}

function clearBodyElement(xml: ParsedXml) {
  const html = Epub.findXmlChildByName("html", xml)
  if (!html) throw new Error("Invalid XHTML: Found no html element")

  const bodyIndex = html["html"].findIndex((element) => "body" in element)
  const body = html["html"][bodyIndex]
  if (!body) throw new Error("Invalid XHTML: Found no body element")

  html["html"].splice(bodyIndex, 1, {
    ...body,
    body: [],
  })
}
