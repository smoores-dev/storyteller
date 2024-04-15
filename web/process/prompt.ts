import { bagOfWords } from "@/synchronize/nlp"

async function readDict() {
  const response = await fetch(
    "https://raw.githubusercontent.com/dwyl/english-words/master/words.txt",
  )
  const dict = await response.text()
  const dictWords = dict.split("\n").map((word) => word.toLowerCase())
  return new Set(dictWords)
}

async function findInventedWords(fullText: string) {
  const allWords = bagOfWords(fullText)
  const dict = await readDict()

  return allWords.filter((word) => !dict.has(word))
}

export async function getInitialPrompt(title: string, fullText: string) {
  const inventedWords = await findInventedWords(fullText)
  const invintedWordString =
    inventedWords.length < 2
      ? inventedWords[0]
      : inventedWords.slice(0, -1).join(", ") +
        ", and " +
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        inventedWords[inventedWords.length - 1]!
  const initialPrompt = `The following is a chapter from the book "${title}". It may contain words that are not in the English dictionary, such as ${invintedWordString}. Please try to transcribe it accurately.`
  return initialPrompt
}
