import wink from "wink-nlp"
import model from "wink-eng-lite-web-model"

const nlp = wink(model)

export function tokenizeSentences(text: string) {
  const nlpDoc = nlp.readDoc(text)
  return (
    nlpDoc
      .sentences()
      .out()
      // Strip out any zero-length "sentences", usually the result of newlines
      .filter((s) => !!s)
  )
}
