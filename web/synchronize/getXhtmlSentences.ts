import { ParsedXml, getElementName, isTextNode, textContent } from "@/epub"
import { tokenizeSentences } from "./nlp"
import { BLOCKS } from "./semantics"

export function getXHtmlSentences(xml: ParsedXml): string[] {
  const sentences: string[] = []
  let stagedText = ""
  for (const child of xml) {
    if (isTextNode(child)) {
      stagedText += child["#text"]
      continue
    }
    const childName = getElementName(child)
    if (!BLOCKS.includes(childName)) {
      stagedText += textContent([child])
      continue
    }
    sentences.push(...tokenizeSentences(stagedText))
    stagedText = ""
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    sentences.push(...getXHtmlSentences(child[childName]!))
  }

  sentences.push(...tokenizeSentences(stagedText))

  return sentences
}
