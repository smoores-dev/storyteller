import assert from "node:assert"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"

import { Epub } from "@storyteller-platform/epub"
import { MediaType } from "@storyteller-platform/media-types"

import { createLogger } from "../../common/logging.ts"
import { EmissionsReader } from "../../emit/fs.ts"
import { createAlignmentSnapshot } from "../../snapshot/ctc/snapshot.ts"
import { Aligner } from "../ctc/Aligner.ts"

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
  emissionFilepaths: string[],
  textRef: "id-fragment" | "text-fragment",
  transliterate?: boolean,
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
    emissionFilepaths,
    textRef,
    transliterate,
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
  emissionsPath: string,
  transliterate?: boolean,
) {
  using epub = await Epub.from(epubPath)

  // Emissions and audio files pair up by index, so both must sort identically
  const audiobookFiles = await readdir(audiobookPath).then((filenames) =>
    filenames
      .filter((f) => MediaType.fromPath(f)?.kind === "audio")
      .toSorted()
      .map((f) => join(audiobookPath, f)),
  )

  const emissionsReader = await EmissionsReader.from(emissionsPath)

  const emissionFilepaths = await readdir(emissionsPath).then((filenames) =>
    filenames
      .filter((f) => f.endsWith(".json") || f.endsWith(".emissions"))
      .toSorted()
      .map((f) => join(emissionsPath, f)),
  )

  const textFragmentEpub = await epub.copy()

  const aligner = new Aligner(
    epub,
    audiobookFiles,
    emissionsReader,
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
    emissionFilepaths,
    "id-fragment",
    transliterate,
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
    emissionFilepaths,
    "text-fragment",
    transliterate,
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
      join("src", "align", "__fixtures__", "peter-and-wendy", "emissions"),
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
      join("src", "align", "__fixtures__", "peter-and-wendy", "emissions"),
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
      join("src", "align", "__fixtures__", "way-of-kings", "emissions"),
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
      join("src", "align", "__fixtures__", "recitatif", "emissions"),
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
      join("src", "align", "__fixtures__", "raven-scholar", "emissions"),
    )
  })

  void itLocally("should align Night", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join("src", "align", "__fixtures__", "night", "text", "Night.epub"),
      join("src", "align", "__fixtures__", "night", "audio"),
      join("src", "align", "__fixtures__", "night", "emissions"),
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
      join("src", "align", "__fixtures__", "immense-world", "emissions"),
    )
  })

  // This fixture doesn't have CTC emissions yet; restore to a plain `it` once
  // they're generated and checked in
  void itLocally(
    "should align Why I Cant Sleep (mandarin)",
    async (context) => {
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
        join("src", "align", "__fixtures__", "why-i-cant-sleep", "emissions"),
        true,
      )
    },
  )

  void itLocally("should align jp", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join(
        "src",
        "align",
        "__fixtures__",
        "青春ブタ野郎はバニーガール先輩の夢を見ない",
        "text",
        "青春ブタ野郎はバニーガール先輩の夢を見ない.epub",
      ),
      join(
        "src",
        "align",
        "__fixtures__",
        "青春ブタ野郎はバニーガール先輩の夢を見ない",
        "transcoded audio",
      ),
      join(
        "src",
        "align",
        "__fixtures__",
        "青春ブタ野郎はバニーガール先輩の夢を見ない",
        "emissions",
      ),
      true,
    )
  })
})
