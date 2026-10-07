import assert from "node:assert"
import { cp, mkdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, it } from "vitest"

import { getTrackMetadata, writeTrackMetadata } from "../ffmpeg.ts"

describe("writeTrackMetadata", () => {
  it("writes shell-special characters verbatim through paths with spaces", async () => {
    const dir = resolve(
      "src/__fixtures__/__output__/Application Support $HOME `id`",
    )
    const scratchDir = resolve(dir, "tmp")
    await mkdir(scratchDir, { recursive: true })
    const path = resolve(dir, 'Worth $1M "Quoted".mp3')
    await cp("src/__fixtures__/sleepy_hollow_irving_64kb.mp3", path)

    const previousScratchDir = process.env["STORYTELLER_SCRATCH_DIR"]
    process.env["STORYTELLER_SCRATCH_DIR"] = scratchDir
    try {
      const trackInfo = await getTrackMetadata(path)
      const title = 'Worth $1M "Quoted" `echo hacked` $(id)'
      await writeTrackMetadata(
        path,
        {
          ...trackInfo,
          tags: { ...trackInfo.tags, title },
          chapters: [{ id: 0, startTime: 0, endTime: 10, title: "One $1" }],
        },
        {
          data: await readFile("src/__fixtures__/sleepy_hollow.jpg"),
          mimeType: "image/jpeg",
          kind: "coverFront",
          name: "Cover $1",
        },
      )

      const actual = await getTrackMetadata(path)
      assert.strictEqual(actual.tags.title, title)
      assert.strictEqual(actual.chapters[0]?.title, "One $1")
      assert.strictEqual(actual.attachedPicMeta?.name, "Cover $1")
    } finally {
      if (previousScratchDir === undefined) {
        delete process.env["STORYTELLER_SCRATCH_DIR"]
      } else {
        process.env["STORYTELLER_SCRATCH_DIR"] = previousScratchDir
      }
    }
  })
})
