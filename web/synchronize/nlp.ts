import wink from "wink-nlp"
import model from "wink-eng-lite-web-model"
import { sentenceSplit, suppressions } from "cldr-segmentation"

const nlp = wink(model)
const { its, as } = nlp

export function tokenizeSentences(text: string, language: string) {
  if (language in suppressions) {
    return sentenceSplit(
      text,
      suppressions[language as keyof typeof suppressions],
    )
  }
  return sentenceSplit(text)
}

export function bagOfWords(text: string) {
  const nlpDoc = nlp.readDoc(text)
  const words = nlpDoc
    .tokens()
    // eslint-disable-next-line @typescript-eslint/unbound-method
    .filter((token) => token.out(its.type) === "word")
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return words.out(its.normal, as.unique)
}
