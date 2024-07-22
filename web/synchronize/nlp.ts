import natural from "natural"

export function tokenizeSentences(text: string) {
  const tokenizer = new natural.SentenceTokenizerNew()
  try {
    const tokenized = tokenizer.tokenize(text.trim())
    const sentences: string[] = []
    for (const s of tokenized) {
      if (!s.startsWith("”")) {
        sentences.push(s)
        continue
      }
      const prevSentence = sentences.pop()
      if (!prevSentence) {
        sentences.push(s)
        continue
      }
      sentences.push(prevSentence + "”")
      if (s.length > 1) {
        sentences.push(s.slice(1).trim())
      }
    }
    return sentences
  } catch {
    return []
  }
}

export function bagOfWords(text: string) {
  const tokenizer = new natural.WordPunctTokenizer()
  return Array.from(new Set(tokenizer.tokenize(text)))
  // const nlpDoc = nlp.readDoc(text)
  // const words = nlpDoc
  //   .tokens()
  //   // eslint-disable-next-line @typescript-eslint/unbound-method
  //   .filter((token) => token.out(its.type) === "word")
  // // eslint-disable-next-line @typescript-eslint/unbound-method
  // return words.out(its.normal, as.unique)
}
