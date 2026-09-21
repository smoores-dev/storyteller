import assert from "node:assert"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { describe, it, type TestContext } from "vitest"

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
  context: TestContext,
  epub: Epub,
  emissionFilepaths: string[],
  textRef: "id-fragment" | "text-fragment",
  transliterate?: boolean,
) {
  const snapshotFilename = getSafeFilepathSegment(
    `${context.task.fullTestName} ${textRef === "id-fragment" ? "[id-fragment]" : "[text-fragment]"}`,
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
  context: TestContext,
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

describe("align", () => {
  it("should align Peter and Wendy", async (context) => {
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

  it.skip("should align Peter and Wendy (word-level)", async (context) => {
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
  itLocally("should align The Way of Kings", async (context) => {
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

  itLocally("should align The Recitatif", async (context) => {
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

  itLocally("should align The Raven Scholar", async (context) => {
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

  itLocally("should align Night", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join("src", "align", "__fixtures__", "night", "text", "Night.epub"),
      join("src", "align", "__fixtures__", "night", "audio"),
      join("src", "align", "__fixtures__", "night", "emissions"),
    )
  })

  itLocally("should align An Immense World", async (context) => {
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

  // One chapter of a Traditional Chinese LibriVox reading against a zh-TW
  // Gutenberg epub, emissions from quartznet15x5_zh, whose vocabulary is
  // Simplified. Generate emissions with scripts/prepare-fixture.ts.
  it("should align 朝花夕拾 chapter 1 (traditional chinese)", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join(
        "src",
        "align",
        "__fixtures__",
        "chaohuasishe",
        "text",
        "朝花夕拾.epub",
      ),
      join("src", "align", "__fixtures__", "chaohuasishe", "audio"),
      join("src", "align", "__fixtures__", "chaohuasishe", "emissions"),
      true,
    )
  })

  // First LibriVox section of Masamune Hakucho's 何処へ against the Gutenberg
  // epub, which keeps the pre-war orthography (入つて, 來, 步). Emissions from
  // quartznet15x5_ja, converted from kinouchi/japanese-quartznet-large.
  it("should align 何処へ section 1 (japanese)", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join("src", "align", "__fixtures__", "dokoe", "text", "何処へ.epub"),
      join("src", "align", "__fixtures__", "dokoe", "audio"),
      join("src", "align", "__fixtures__", "dokoe", "emissions"),
      true,
    )
  })

  // LibriVox chapter 1 of Fouqué's Undine against the Projekt Gutenberg text,
  // emissions from quartznet15x5_de
  it("should align Undine chapter 1 (german)", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join("src", "align", "__fixtures__", "undine", "text", "Undine.epub"),
      join("src", "align", "__fixtures__", "undine", "audio"),
      join("src", "align", "__fixtures__", "undine", "emissions"),
    )
  })

  // LibriVox chapter 1 of Tolstoy's Детство against the Wikisource text,
  // emissions from quartznet15x5_ru
  it("should align Детство chapter 1 (russian)", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join("src", "align", "__fixtures__", "detstvo", "text", "Детство.epub"),
      join("src", "align", "__fixtures__", "detstvo", "audio"),
      join("src", "align", "__fixtures__", "detstvo", "emissions"),
      true,
    )
  })

  // LibriVox preface (مقدمة) of al-Kawakibi's طبائع الاستبداد against the
  // Wikisource text, which carries diacritics, emissions from quartznet15x5_ar
  it("should align طبائع الاستبداد preface (arabic)", async (context) => {
    await testAlignBook(
      context,
      "sentence",
      join(
        "src",
        "align",
        "__fixtures__",
        "tabai-al-istibdad",
        "text",
        "طبائع الاستبداد.epub",
      ),
      join("src", "align", "__fixtures__", "tabai-al-istibdad", "audio"),
      join("src", "align", "__fixtures__", "tabai-al-istibdad", "emissions"),
      true,
    )
  })

  // This fixture doesn't have CTC emissions yet; restore to a plain `it` once
  // they're generated and checked in
  itLocally("should align Why I Cant Sleep (mandarin)", async (context) => {
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
  })

  itLocally("should align jp", async (context) => {
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
