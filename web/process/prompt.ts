import { bagOfWords } from "@/synchronize/nlp"
import { readFile } from "fs/promises"

async function readDict(path: string) {
  const dict = await readFile(path, { encoding: "utf-8" })
  const dictWords = dict.split("\n").map((word) => word.toLowerCase())
  return new Set(dictWords)
}

async function findInventedWords(fullText: string, dictPath: string) {
  const allWords = bagOfWords(fullText)
  const dict = await readDict(dictPath)

  return allWords.filter((word) => !dict.has(word))
}

export async function getInitialPrompt(
  title: string,
  fullText: string,
  dictPath: string,
) {
  const inventedWords = await findInventedWords(fullText, dictPath)
  const invintedWordString =
    inventedWords.length < 2
      ? inventedWords
      : inventedWords.slice(0, -1).join(", ") +
        ", and" +
        inventedWords[inventedWords.length - 1]
  const initialPrompt = `The following is a chapter from the book "${title}". It may contain words that are not in the English dictionary, such as ${invintedWordString}. Please try to transcribe it accurately.`
  return initialPrompt
}
