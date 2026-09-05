import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { MediaType } from "./index.ts"
import { buildTableJson, serializeTableJson } from "./json.ts"

void describe("the table", () => {
  void it("gives every media type a unique constant name", () => {
    const names = MediaType.all.map((row) => row.name)
    assert.equal(new Set(names).size, names.length)
  })

  void it("claims every extension exactly once, lowercase, with a dot", () => {
    const seen = new Set<string>()
    for (const row of MediaType.all) {
      for (const extension of row.extensions) {
        assert.ok(extension.startsWith("."), `${extension} needs a leading dot`)
        assert.equal(extension, extension.toLowerCase())
        assert.ok(!seen.has(extension), `${extension} is claimed twice`)
        seen.add(extension)
      }
    }
  })

  void it("never aliases a mime that is itself a row", () => {
    for (const row of MediaType.all) {
      for (const alias of row.aliases) {
        assert.equal(MediaType.fromMime(alias), row)
        assert.ok(!MediaType.all.some((other) => other.mime === alias))
      }
    }
  })

  void it("toString() returns the mime type", () => {
    assert.equal(MediaType.EPUB.toString(), "application/epub+zip")
  })

  void it("only marks images as cover candidates", () => {
    for (const row of MediaType.all) {
      if (row.cover) assert.equal(row.kind, "image")
    }
  })
})

void describe("MediaType.fromPath", () => {
  void it("lowercases and reads the basename", () => {
    assert.equal(MediaType.fromPath("Track.MP3"), MediaType.MPEG_AUDIO)
    assert.equal(MediaType.fromPath("/some.dir/track"), null)
    assert.equal(
      MediaType.fromPath("C:\\books\\track.m4b"),
      MediaType.MP4_AUDIO,
    )
    assert.equal(
      MediaType.fromPath("audio.book/chapter.1.flac"),
      MediaType.FLAC_AUDIO,
    )
  })

  void it("does not treat a dotfile as an extension", () => {
    assert.equal(MediaType.fromPath(".mp3"), null)
    assert.equal(MediaType.fromPath("/books/.DS_Store"), null)
    assert.equal(MediaType.fromPath(".hidden.mp3"), MediaType.MPEG_AUDIO)
  })

  void it("types every audio extension, not just the popular eight", () => {
    for (const ext of [".opus", ".oga", ".mogg", ".aiff", ".alac", ".weba"]) {
      assert.equal(MediaType.fromPath(`track${ext}`)?.kind, "audio", ext)
    }
  })

  void it("types .mp4 as audio, not application", () => {
    assert.equal(MediaType.fromPath("chapter.mp4"), MediaType.MP4_AUDIO)
  })

  void it("knows the publication package extensions", () => {
    assert.equal(MediaType.fromPath("book.audiobook")?.kind, "package")
    assert.equal(MediaType.fromPath("aligned.gnp")?.kind, "package")
    assert.equal(MediaType.fromPath("book.zip")?.kind, "archive")
    assert.equal(MediaType.fromPath("book.xyz"), null)
  })
})

void describe("MediaType.fromExtension", () => {
  void it("accepts an extension with or without a dot, any case", () => {
    assert.equal(MediaType.fromExtension(".mp3"), MediaType.MPEG_AUDIO)
    assert.equal(MediaType.fromExtension("mp3"), MediaType.MPEG_AUDIO)
    assert.equal(MediaType.fromExtension(".MP3"), MediaType.MPEG_AUDIO)
    assert.equal(MediaType.fromExtension(".xyz"), null)
  })
})

void describe("MediaType.fromMime", () => {
  void it("resolves aliases, parameters and case", () => {
    assert.equal(MediaType.fromMime("image/epub"), MediaType.EPUB)
    assert.equal(MediaType.fromMime("video/mp4"), MediaType.MP4_AUDIO)
    assert.equal(MediaType.fromMime("application/mp4"), MediaType.MP4_AUDIO)
    assert.equal(
      MediaType.fromMime("audio/mpeg; codecs=mp3"),
      MediaType.MPEG_AUDIO,
    )
    assert.equal(MediaType.fromMime("Audio/MPEG"), MediaType.MPEG_AUDIO)
    assert.equal(MediaType.fromMime("application/nonsense"), null)
    assert.equal(MediaType.fromMime(""), null)
  })
})

void describe("kinds", () => {
  void it("lists the rows of a kind", () => {
    const audio = MediaType.ofKind("audio")
    assert.ok(audio.includes(MediaType.MPEG_AUDIO))
    assert.ok(!(audio as readonly MediaType[]).includes(MediaType.PNG))
    assert.deepEqual(MediaType.ofKind("ebook"), [MediaType.EPUB])
  })

  void it("narrows with is()", () => {
    const row = MediaType.fromPath("a.m4b")
    assert.ok(row?.is("audio"))
    assert.ok(!row.is("image"))
  })
})

void describe("table.json", () => {
  void it("matches the generated output", () => {
    const committed = readFileSync(
      fileURLToPath(new URL("./table.json", import.meta.url)),
      "utf8",
    )
    assert.equal(
      committed,
      serializeTableJson(),
      "table.json is stale, run `yarn generate:json`",
    )
  })

  void it("covers every row in the table", () => {
    const { mediaTypes } = buildTableJson()
    assert.equal(mediaTypes.length, MediaType.all.length)
    for (const entry of mediaTypes) {
      assert.equal(MediaType.fromMime(entry.mime)?.name, entry.name)
    }
  })
})
