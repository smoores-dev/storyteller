import assert from "node:assert"
import { copyFile, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, it } from "vitest"

import { Epub } from "@storyteller-platform/epub"

import { writeAudioChapters } from "../audioChapters.tsx"

const FIXTURE = join("src", "__fixtures__", "moby-dick-small.epub")

async function openCopy() {
  const dir = await mkdtemp(join(tmpdir(), "audio-chapters-"))
  const path = join(dir, "book.epub")
  await copyFile(FIXTURE, path)
  return Epub.from(path)
}

function titles(children: { title: string; children?: unknown }[]): string[] {
  return children.flatMap((child) => [
    child.title,
    ...(Array.isArray(child.children)
      ? titles(child.children as typeof children)
      : []),
  ])
}

describe("writeAudioChapters", () => {
  it("inserts a chapter into the spine and the table of contents", async () => {
    using epub = await openCopy()
    const spine = await epub.getSpineItems()
    const anchor = spine.find((item) => item.id !== spine[0]?.id)
    assert.ok(anchor)
    const before = (await epub.getTableOfContents())?.children ?? []
    const anchorTitle = titles(before).find((title) =>
      before.some((entry) => entry.title === title),
    )
    assert.ok(anchorTitle)

    const written = await writeAudioChapters(
      epub,
      [
        {
          anchor: { chapterId: anchor.id, sentenceId: 3, position: "after" },
          holes: [
            {
              audiofile: "/tmp/interview.mp3",
              start: 0,
              end: 90,
              anchor: {
                chapterId: anchor.id,
                sentenceId: 3,
                position: "after",
              },
              boundary: true,
              between: "",
            },
          ],
          title: "Interview",
          anchorTitle: null,
          existing: null,
        },
      ],
      new Intl.Locale("en"),
    )

    assert.strictEqual(written.length, 1)
    const [chapter] = written
    assert.ok(chapter)

    const after = await epub.getSpineItems()
    const anchorIndex = after.findIndex((item) => item.id === anchor.id)
    assert.strictEqual(after[anchorIndex + 1]?.id, chapter.id)

    const manifest = await epub.getManifest()
    assert.strictEqual(
      manifest[chapter.id]?.mediaOverlay,
      `${chapter.id}_overlay`,
    )

    const smil = await epub.readItemContents(`${chapter.id}_overlay`, "utf-8")
    assert.match(smil, /storyteller:audio-only/)
    assert.match(smil, /clipEnd="90\.000s"/)

    const toc = (await epub.getTableOfContents())?.children ?? []
    const flat = titles(toc)
    assert.ok(flat.includes("Interview"))
    const anchorEntries = toc
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) =>
        entry.href?.includes(anchor.href.split("/").pop() ?? ""),
      )
    const last = anchorEntries.at(-1)
    assert.ok(last)
    assert.strictEqual(toc[last.index + 1]?.title, "Interview")
  })

  it("attaches an overlay to an excluded chapter instead of making one", async () => {
    using epub = await openCopy()
    const spine = await epub.getSpineItems()
    const anchor = spine[0]
    const reused = spine[1]
    assert.ok(anchor)
    assert.ok(reused)

    const written = await writeAudioChapters(
      epub,
      [
        {
          anchor: { chapterId: anchor.id, sentenceId: 3, position: "after" },
          holes: [
            {
              audiofile: "/tmp/bonus.mp3",
              start: 0,
              end: 120,
              anchor: {
                chapterId: anchor.id,
                sentenceId: 3,
                position: "after",
              },
              boundary: true,
              between: "",
            },
          ],
          title: null,
          anchorTitle: "Chapter 1",
          existing: { id: reused.id, title: "Bonus material" },
        },
      ],
      new Intl.Locale("en"),
    )

    assert.deepStrictEqual(
      written.map((chapter) => [chapter.id, chapter.title, chapter.href]),
      [[reused.id, "Bonus material", reused.href]],
    )

    const after = await epub.getSpineItems()
    assert.deepStrictEqual(
      after.map((item) => item.id),
      spine.map((item) => item.id),
    )

    const manifest = await epub.getManifest()
    assert.strictEqual(
      manifest[reused.id]?.mediaOverlay,
      `${reused.id}_overlay`,
    )

    const smil = await epub.readItemContents(`${reused.id}_overlay`, "utf-8")
    assert.match(smil, /storyteller:audio-only/)
    assert.match(smil, /clipEnd="120\.000s"/)

    const fragment = /src="[^"]*#([^"]+)"/.exec(smil)?.[1]
    assert.ok(fragment)
    const contents = await epub.readItemContents(reused.id, "utf-8")
    assert.ok(contents.includes(`id="${fragment}"`))

    const metadata = await epub.getMetadata()
    assert.ok(
      metadata.some(
        (entry) =>
          entry.properties["refines"] === `#${reused.id}_overlay` &&
          entry.properties["property"] === "media:duration",
      ),
    )
  })
})
