import assert from "node:assert"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"

import { isAudioFile } from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"
import { type RecognitionResult } from "@storyteller-platform/ghost-story"

import { createLogger } from "../../common/logging.ts"
import { createAlignmentSnapshot } from "../../snapshot/snapshot.ts"
import { Aligner } from "../align.ts"

const itLocally = process.env["TEST_LOCAL_ONLY"] ? it : it.skip

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
  textRef: "id-fragment" | "text-fragment",
) {
  const snapshotFilename = getSafeFilepathSegment(
    `${context.fullName} ${textRef === "id-fragment" ? "[id-fragment]" : "[text-fragment]"}`,
    ".snapshot",
  )
  const snapshotFilepath = join(
    "src",
    "align",
    "__snapshots__",
    snapshotFilename,
  )

  const newSnapshot = await createAlignmentSnapshot(
    epub,
    transcriptionFilepaths,
    textRef,
  )

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

async function testAlignBook(
  context: it.TestContext,
  granularity: "sentence" | "word",
  epubPath: string,
  audiobookPath: string,
  transcriptionsPath: string,
) {
  using epub = await Epub.from(epubPath)

  const audiobookFiles = await readdir(audiobookPath).then((filenames) =>
    filenames.filter((f) => isAudioFile(f)).map((f) => join(audiobookPath, f)),
  )
  const transcriptionFilepaths = await readdir(transcriptionsPath).then(
    (filenames) =>
      filenames
        .filter((f) => f.endsWith(".json"))
        .map((f) => join(transcriptionsPath, f)),
  )
  const transcriptions = await Promise.all(
    transcriptionFilepaths.map(async (p) => readFile(p, { encoding: "utf-8" })),
  ).then((contents) =>
    contents.map(
      (c) =>
        JSON.parse(c) as Pick<RecognitionResult, "transcript" | "timeline">,
    ),
  )

  const textFragmentEpub = await epub.copy()

  const aligner = new Aligner(
    epub,
    audiobookFiles,
    transcriptions,
    granularity,
    "id-fragment",
    undefined,
    createTestLogger(),
  )

  const timing = await aligner.alignBook()

  if (!process.env["CI"]) timing.print()

  await assertAlignSnapshot(
    context,
    epub,
    transcriptionFilepaths,
    "id-fragment",
  )

  aligner.epub = textFragmentEpub
  // @ts-expect-error internal property
  aligner.textRef = "text-fragment"

  // @ts-expect-error internal property
  for (const chapter of aligner.alignedChapters) {
    // @ts-expect-error internal property
    await aligner.writeAlignedChapter(chapter)
  }

  await assertAlignSnapshot(
    context,
    textFragmentEpub,
    transcriptionFilepaths,
    "text-fragment",
  )
}

void describe("align", () => {
  void it("should align Peter and Wendy", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join(
        "src",
        "align",
        "__fixtures__",
        "peter-and-wendy",
        "text",
        "Peter and Wendy.epub",
      ),
      join("src", "align", "__fixtures__", "peter-and-wendy", "audio"),
      join("src", "align", "__fixtures__", "peter-and-wendy", "transcriptions"),
    )
  })

  void it.skip("should align Peter and Wendy (word-level)", async (context) => {
    await testAlignBook(
      context,
      "word",
      join(
        "src",
        "align",
        "__fixtures__",
        "peter-and-wendy",
        "text",
        "Peter and Wendy.epub",
      ),
      join("src", "align", "__fixtures__", "peter-and-wendy", "audio"),
      join("src", "align", "__fixtures__", "peter-and-wendy", "transcriptions"),
    )
  })

  // These books are not public commons, so Shane runs these tests locally but the
  // books and snapshots aren't checked in
  void itLocally("should align The Way of Kings", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join(
        "src",
        "align",
        "__fixtures__",
        "way-of-kings",
        "text",
        "The Way of Kings.epub",
      ),
      join("src", "align", "__fixtures__", "way-of-kings", "audio"),
      join("src", "align", "__fixtures__", "way-of-kings", "transcriptions"),
    )
  })

  void itLocally("should align The Recitatif", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join(
        "src",
        "align",
        "__fixtures__",
        "recitatif",
        "text",
        "Recitatif.epub",
      ),
      join("src", "align", "__fixtures__", "recitatif", "audio"),
      join("src", "align", "__fixtures__", "recitatif", "transcriptions"),
    )
  })

  void itLocally("should align The Raven Scholar", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join(
        "src",
        "align",
        "__fixtures__",
        "raven-scholar",
        "text",
        "The Raven Scholar.epub",
      ),
      join("src", "align", "__fixtures__", "raven-scholar", "audio"),
      join("src", "align", "__fixtures__", "raven-scholar", "transcriptions"),
    )
  })

  void itLocally("should align Night", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join("src", "align", "__fixtures__", "night", "text", "Night.epub"),
      join("src", "align", "__fixtures__", "night", "audio"),
      join("src", "align", "__fixtures__", "night", "transcriptions"),
    )
  })

  void itLocally("should align An Immense World", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join(
        "src",
        "align",
        "__fixtures__",
        "immense-world",
        "text",
        "An Immense World.epub",
      ),
      join("src", "align", "__fixtures__", "immense-world", "audio"),
      join("src", "align", "__fixtures__", "immense-world", "transcriptions"),
    )
  })

  void it("should align Why I Cant Sleep (mandarin)", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join(
        "src",
        "align",
        "__fixtures__",
        "why-i-cant-sleep",
        "text",
        "why_i_cant_sleep_hanzi_only.epub",
      ),
      join("src", "align", "__fixtures__", "why-i-cant-sleep", "audio"),
      join(
        "src",
        "align",
        "__fixtures__",
        "why-i-cant-sleep",
        "transcriptions",
      ),
    )
  })
})
