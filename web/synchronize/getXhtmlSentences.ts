import { ParsedXml, getElementName, isTextNode, textContent } from "@/epub"
import { tokenizeSentences } from "./nlp"
import { BLOCKS } from "./semantics"

export function getXHtmlSentences(xml: ParsedXml, language: string): string[] {
  const sentences: string[] = []
  let stagedText = ""
  for (const child of xml) {
    if (isTextNode(child)) {
      stagedText += child["#text"]
      continue
    }
    const childName = getElementName(child)
    if (!BLOCKS.includes(childName)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      stagedText += textContent(child[childName]!)
      continue
    }
    sentences.push(...tokenizeSentences(stagedText, language))
    stagedText = ""
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    sentences.push(...getXHtmlSentences(child[childName]!, language))
  }

  sentences.push(...tokenizeSentences(stagedText, language))

  return sentences
}
