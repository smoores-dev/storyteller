import assert from "node:assert"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"
import { basename as posixBasename } from "node:path/posix"
import { describe, it } from "node:test"

import { isAudioFile } from "@storyteller-platform/audiobook"
import { Epub, type ParsedXml } from "@storyteller-platform/epub"
import { type RecognitionResult } from "@storyteller-platform/ghost-story"

import { createLogger } from "../../common/logging.ts"
import { getXhtmlSegmentation } from "../../markup/segmentation.ts"
import { Aligner } from "../align.ts"

function createTestLogger() {
  return createLogger(process.env["CI"] ? "silent" : "info")
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/[/\\:*?"<>|]/g, "-") // Windows illegal chars
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim() // Trim trailing whitespace
    .replace(/[.]+$/, "") // No trailing dots
}

function truncate(input: string, byteLimit: number, suffix = ""): string {
  const normalized = input.normalize("NFC")
  const encoder = new TextEncoder()

  let result = ""
  for (const char of normalized) {
    const withSuffix = result + char + suffix
    const byteLength = encoder.encode(withSuffix).length

    if (byteLength > byteLimit) break
    result += char
  }

  return result + suffix
}

function getSafeFilepathSegment(name: string, suffix: string = "") {
  return truncate(sanitizeFilename(name), 150, suffix)
}

async function assertAlignSnapshot(
  context: it.TestContext,
  epub: Epub,
  transcriptionFilepaths: string[],
) {
  const snapshotFilename = getSafeFilepathSegment(context.fullName, ".snapshot")
  const snapshotFilepath = join(
    "src",
    "align",
    "__snapshots__",
    snapshotFilename,
  )

  let newSnapshot = ""

  const manifest = await epub.getManifest()
  const mediaOverlayItems = Object.values(manifest)
    .map((item) => item.mediaOverlay)
    .filter((mediaOverlayId): mediaOverlayId is string => !!mediaOverlayId)
    .map((id) => manifest[id]!)

  const mediaOverlays: ParsedXml[] = []
  for (const item of mediaOverlayItems) {
    const contents = await epub.readItemContents(item.id, "utf-8")
    const parsed = Epub.xmlParser.parse(contents) as ParsedXml
    mediaOverlays.push(parsed)
    const smil = Epub.findXmlChildByName("smil", parsed)
    if (!smil) continue
    const body = Epub.findXmlChildByName("body", Epub.getXmlChildren(smil))
    if (!body) continue
    const seq = Epub.findXmlChildByName("seq", Epub.getXmlChildren(body))
    if (!seq) continue
    const textref = seq[":@"]?.["@_epub:textref"]
    if (!textref) continue
    newSnapshot += `// ${posixBasename(textref)}\n\n`
    const chapterContents = await epub.readFileContents(
      textref,
      item.href,
      "utf-8",
    )
    const chapterXml = Epub.xhtmlParser.parse(chapterContents) as ParsedXml
    const { result: segmentation } = await getXhtmlSegmentation(
      Epub.getXhtmlBody(chapterXml),
      {
        primaryLocale: new Intl.Locale("en-US"),
      },
    )
    const chapterSentences = segmentation
      .map((s) => s.text)
      .filter((s) => s.match(/\S/))
    for (const par of Epub.getXmlChildren(seq)) {
      newSnapshot += `\n`
      const text = Epub.findXmlChildByName("text", Epub.getXmlChildren(par))
      if (!text) continue
      const audio = Epub.findXmlChildByName("audio", Epub.getXmlChildren(par))
      if (!audio) continue

      const textSrc = text[":@"]?.["@_src"]
      if (!textSrc) continue
      const sentenceId = textSrc.match(/[0-9]+$/)?.[0]
      if (sentenceId === undefined) continue

      const textSentence = chapterSentences[parseInt(sentenceId)]
      if (!textSentence) continue
      newSnapshot += `Text:  ${textSentence.replace(/\n/, "")}\n`

      const audioSrc = audio[":@"]?.["@_src"]
      if (!audioSrc) continue

      const audioStart = audio[":@"]?.["@_clipBegin"]
      const audioEnd = audio[":@"]?.["@_clipEnd"]
      if (!audioStart || !audioEnd) continue

      // Subtract a bit in case this got bumped up by the expander
      const audioStartTime = parseFloat(audioStart.slice(0, -1)) - 0.002
      const audioEndTime = parseFloat(audioEnd.slice(0, -1))

      const audioFilename = posixBasename(audioSrc, extname(audioSrc))
      const transcriptionFilepath = transcriptionFilepaths.find(
        (f) => basename(f, extname(f)) === audioFilename,
      )
      if (!transcriptionFilepath) continue

      const transcription = JSON.parse(
        await readFile(transcriptionFilepath, { encoding: "utf-8" }),
      ) as Pick<RecognitionResult, "transcript" | "timeline">

      const transcriptionWords: string[] = []
      let started = false
      let i = 0
      let word = transcription.timeline[i]
      while (word && word.endTime <= audioEndTime) {
        if (word.startTime >= audioStartTime) {
          started = true
        }
        if (started) {
          transcriptionWords.push(word.text)
        }
        word = transcription.timeline[++i]
      }

      const transcriptionSentence = transcriptionWords.join(" ")
      newSnapshot += `Audio: ${transcriptionSentence}\n`
    }

    newSnapshot += `\n`
  }

  if (process.env["UPDATE_SNAPSHOTS"]) {
    await mkdir(dirname(snapshotFilepath), { recursive: true })
    await writeFile(snapshotFilepath, newSnapshot, { encoding: "utf-8" })
    return
  }

  try {
    const existingSnapshot = await readFile(snapshotFilepath, {
      encoding: "utf-8",
    })

    const existingLines = existingSnapshot.split("\n")
    const newLines = newSnapshot.split("\n")
    for (let i = 0; i < existingLines.length; i++) {
      const existingLine = existingLines[i]
      const newLine = newLines[i]
      if (existingLine !== newLine) {
        assert.strictEqual(
          newLines.slice(Math.max(0, i - 5), i + 5),
          existingLines.slice(Math.max(0, i - 5), i + 5),
        )
      }
    }
  } catch (e) {
    if (e instanceof assert.AssertionError) {
      throw e
    }
    throw new assert.AssertionError({
      actual: newSnapshot,
      expected: "",
      diff: "simple",
    })
  }
}

void describe("align", () => {
  void it("should align Peter and Wendy", async (context) => {
    using epub = await Epub.from(
      join(
        "src",
        "align",
        "__fixtures__",
        "peter-and-wendy",
        "text",
        "Peter and Wendy.epub",
      ),
    )

    const audiobookDir = join(
      "src",
      "align",
      "__fixtures__",
      "peter-and-wendy",
      "audio",
    )
    const audiobookFiles = await readdir(audiobookDir).then((filenames) =>
      filenames.filter((f) => isAudioFile(f)).map((f) => join(audiobookDir, f)),
    )

    const transcriptionsDir = join(
      "src",
      "align",
      "__fixtures__",
      "peter-and-wendy",
      "transcriptions",
    )
    const transcriptionFilepaths = await readdir(transcriptionsDir).then(
      (filenames) =>
        filenames
          .filter((f) => f.endsWith(".json"))
          .map((f) => join(transcriptionsDir, f)),
    )
    const transcriptions = await Promise.all(
      transcriptionFilepaths.map(async (p) =>
        readFile(p, { encoding: "utf-8" }),
      ),
    ).then((contents) =>
      contents.map(
        (c) =>
          JSON.parse(c) as Pick<RecognitionResult, "transcript" | "timeline">,
      ),
    )

    const aligner = new Aligner(
      epub,
      audiobookFiles,
      transcriptions,
      "sentence",
      undefined,
      createTestLogger(),
    )

    const timing = await aligner.alignBook()

    if (!process.env["CI"]) timing.print()

    await assertAlignSnapshot(context, epub, transcriptionFilepaths)
  })
})
