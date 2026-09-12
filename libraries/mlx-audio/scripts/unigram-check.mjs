import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  encodeUnigram,
  readSentencePieceModel,
  unigramTokenizer,
} from "@storyteller-platform/ghost-story"

const [modelDir, referencePath] = process.argv.slice(2)
if (!modelDir || !referencePath) {
  console.error(
    "usage: node scripts/unigram-check.mjs <model-dir> <spm-reference.json>",
  )
  process.exit(1)
}

const vocab = new Map()
for (const line of readFileSync(join(modelDir, "vocab.txt"), "utf-8").split(
  "\n",
)) {
  if (!line) continue
  const space = line.lastIndexOf(" ")
  vocab.set(line.slice(0, space), Number(line.slice(space + 1)))
}
const tokenizer = unigramTokenizer(
  readSentencePieceModel(readFileSync(join(modelDir, "tokenizer.spm"))),
  vocab,
)
const reference = JSON.parse(readFileSync(referencePath, "utf-8"))

let sentences = 0
let tokens = 0
let mismatches = 0
const start = performance.now()
for (const { text, ids } of reference) {
  const { ids: ours } = encodeUnigram(
    vocab,
    tokenizer,
    "▁" + text.replaceAll(" ", "▁"),
  )
  sentences++
  tokens += ids.length
  if (ours.length !== ids.length || ours.some((id, i) => id !== ids[i])) {
    mismatches++
    if (mismatches <= 3)
      console.log(
        "mismatch:",
        JSON.stringify(text.slice(0, 80)),
        "\n  python",
        ids.slice(0, 20),
        "\n  ours  ",
        Array.from(ours).slice(0, 20),
      )
  }
}
console.log(
  `${sentences} sentences, ${tokens} tokens, ${mismatches} sentences differ from python sentencepiece, ${(performance.now() - start).toFixed(0)} ms`,
)
