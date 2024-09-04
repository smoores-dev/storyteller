import {
  ParsedXml,
  XmlNode,
  findByName,
  getElementName,
  isTextNode,
} from "@/epub"
import { BLOCKS } from "./semantics"
import { getXHtmlSentences } from "./getXhtmlSentences"

type Mark = {
  elementName: string
  attributes: Record<string, string> | undefined
}

export function appendTextNode(
  xml: ParsedXml,
  text: string,
  marks: Mark[],
  taggedSentences: Set<number>,
  sentenceId?: number,
) {
  if (text.length === 0) return

  const textNode = { "#text": text } as unknown as XmlNode

  appendLeafNode(xml, textNode, marks, taggedSentences, sentenceId)
}

export function appendLeafNode(
  xml: ParsedXml,
  node: XmlNode,
  marks: Mark[],
  taggedSentences: Set<number>,
  sentenceId?: number,
) {
  const tagId = `sentence${sentenceId}`

  const markedNode = [...marks].reverse().reduce<XmlNode>(
    (acc, mark) =>
      ({
        [mark.elementName]: [acc],
        ":@": mark.attributes,
      }) as unknown as XmlNode,
    node,
  )

  const lastNode = xml[xml.length - 1]
  if (
    lastNode &&
    !isTextNode(lastNode) &&
    lastNode[":@"]?.["@_id"] &&
    lastNode[":@"]["@_id"] === tagId
  ) {
    const tagName = getElementName(lastNode)
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
  } as unknown as XmlNode

  taggedSentences.add(sentenceId)
  xml.push(taggedNode)
}

type TagState = {
  currentSentenceIndex: number
  currentSentenceProgress: number
  currentNodeProgress: number
}

function tagSentencesInXml(
  currentSentenceIndex: number,
  currentSentenceProgress: number,
  sentences: string[],
  currentNode: XmlNode,
  currentNodeProgress: number,
  taggedSentences: Set<number>,
  marks: Mark[],
  taggedXml: ParsedXml,
): TagState {
  if (isTextNode(currentNode)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const remainingSentence = sentences[currentSentenceIndex]!.slice(
      currentSentenceProgress,
    )
    const text = currentNode["#text"]
    const remainingNodeText = text.slice(currentNodeProgress)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const index = remainingNodeText.indexOf(remainingSentence[0]!)
    if (index === -1) {
      appendTextNode(taggedXml, remainingNodeText, marks, taggedSentences)
      return {
        currentSentenceIndex,
        currentSentenceProgress,
        currentNodeProgress: -1,
      }
    }
    if (remainingNodeText.slice(index).length < remainingSentence.length) {
      appendTextNode(
        taggedXml,
        remainingNodeText.slice(0, index),
        marks,
        taggedSentences,
      )
      appendTextNode(
        taggedXml,
        remainingNodeText.slice(index),
        marks,
        taggedSentences,
        currentSentenceIndex,
      )
      return {
        currentSentenceIndex,
        currentSentenceProgress:
          currentSentenceProgress + remainingNodeText.length - index,
        currentNodeProgress: -1,
      }
    } else {
      appendTextNode(
        taggedXml,
        remainingNodeText.slice(0, index),
        marks,
        taggedSentences,
      )
      appendTextNode(
        taggedXml,
        remainingSentence,
        marks,
        taggedSentences,
        currentSentenceIndex,
      )

      // If we've just appended the very last sentence, make sure that we also
      // add back the remainder of this text node (which should be whitespace).
      if (currentSentenceIndex + 1 === sentences.length) {
        appendTextNode(
          taggedXml,
          remainingNodeText.slice(index + remainingSentence.length),
          marks,
          taggedSentences,
        )
      }

      return {
        currentSentenceIndex: currentSentenceIndex + 1,
        currentSentenceProgress: 0,
        currentNodeProgress:
          currentNodeProgress + remainingSentence.length + index,
      }
    }
  }

  const tagName = getElementName(currentNode)

  let state: TagState = {
    currentSentenceIndex,
    currentSentenceProgress,
    currentNodeProgress,
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const children = currentNode[tagName]!
  for (const child of children) {
    if (state.currentSentenceIndex > sentences.length - 1) {
      taggedXml.push(child)
      continue
    }
    state.currentNodeProgress = 0

    let nextTaggedXml = taggedXml
    const nextMarks = [...marks]
    if (!isTextNode(child)) {
      const childTagName = getElementName(child)

      const isTextContent = BLOCKS.includes(childTagName.toLowerCase())

      if (child[childTagName]?.length === 0) {
        appendLeafNode(
          taggedXml,
          child,
          nextMarks,
          taggedSentences,
          isTextContent || state.currentSentenceProgress === 0
            ? undefined
            : state.currentSentenceIndex,
        )
        continue
      }

      if (isTextContent) {
        const block = {
          [childTagName]: [],
          ":@": child[":@"],
        } as unknown as XmlNode
        nextTaggedXml.push(block)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        nextTaggedXml = block[childTagName]!
      } else {
        nextMarks.push({
          elementName: childTagName,
          attributes: child[":@"],
        })
      }
    }
    while (
      state.currentSentenceIndex < sentences.length &&
      state.currentNodeProgress !== -1
    ) {
      state = tagSentencesInXml(
        state.currentSentenceIndex,
        state.currentSentenceProgress,
        sentences,
        child,
        state.currentNodeProgress,
        taggedSentences,
        nextMarks,
        nextTaggedXml,
      )
    }
  }

  state.currentNodeProgress = -1
  return state
}

function copyOuterXml(xml: ParsedXml) {
  const outerXml: ParsedXml = xml
  const html = findByName("html", xml)
  if (!html) throw new Error("Invalid XHTML: Found no html element")

  const bodyIndex = html["html"].findIndex((element) => "body" in element)
  const body = html["html"][bodyIndex]
  if (!body) throw new Error("Invalid XHTML: Found no body element")

  html["html"].splice(bodyIndex, 1, {
    ...body,
    body: [],
  } as unknown as XmlNode)

  return outerXml
}

export function tagSentences(xml: ParsedXml, language: string) {
  const html = findByName("html", xml)
  if (!html) throw new Error("Invalid XHTML document: no html element")

  const body = findByName("body", html["html"])
  if (!body) throw new Error("Invalid XHTML document: No body element")

  const sentences = getXHtmlSentences(body["body"], language)
  const outerXml = copyOuterXml(xml)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const taggedHtml = findByName("html", xml)!

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const taggedBody = findByName("body", taggedHtml["html"])!
  taggedBody["body"] = []

  tagSentencesInXml(0, 0, sentences, body, 0, new Set(), [], taggedBody["body"])

  return outerXml
}
