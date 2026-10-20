import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import {
  Epub,
  TmpFsAdapter,
  type ManifestItem,
} from "@storyteller-platform/epub"

import { type BookWithRelations } from "@/database/books.ts"
import { type UriReference } from "@/progress/uriReference.ts"

const run = promisify(execFile)

const XHTML_NS = "http://www.w3.org/1999/xhtml"
const SMIL_NS = "http://www.w3.org/ns/SMIL"
const EPUB_NS = "http://www.idpf.org/2007/ops"

export const CHAPTER_1 = "OEBPS/Text/chapter1.xhtml"
export const CHAPTER_2 = "OEBPS/Text/chapter2.xhtml"
export const AUDIO_1 = "OEBPS/Audio/chapter1.mp3"
export const AUDIO_2 = "OEBPS/Audio/chapter2.mp3"

/**
 * The length of the readaloud's audio files. Every clip of the media overlays
 * falls inside its own file, so a file's timeline starts at zero, which is how
 * the standalone audiobook is measured too.
 */
export const AUDIO_1_SECONDS = 20
export const AUDIO_2_SECONDS = 10

/**
 * The same 30 seconds as the readaloud, cut and named nothing like the epub's
 * files: 0-12s, 12-22s and 22-30s of the book.
 */
export const TRACK_1 = "01-call-me-ishmael.mp3"
export const TRACK_2 = "02-the-pouch.mp3"
export const TRACK_3 = "03-a-squeeze-of-the-hand.mp3"

export const TRACKS: [name: string, seconds: number][] = [
  [TRACK_1, 12],
  [TRACK_2, 10],
  [TRACK_3, 8],
]

/**
 * Silence as an mp3. The audio of a fixture book has to be a recording
 * ffprobe can read: durations decide which file a position of the book falls
 * in once readaloud audio and standalone audio are translated into each other.
 */
async function silence(seconds: number): Promise<Uint8Array> {
  const scratch = join(tmpdir(), `storyteller-silence-${randomUUID()}.mp3`)

  await run("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=8000:cl=mono",
    "-t",
    String(seconds),
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "32k",
    scratch,
  ])

  const bytes = await readFile(scratch)
  await rm(scratch, { force: true })

  return bytes
}

/**
 * Writes a standalone audiobook - a directory of tracks - and returns it.
 *
 * @param tracks the files to write, defaulting to `TRACKS`
 */
export async function buildAudiobook(
  dir: string,
  tracks: [name: string, seconds: number][] = TRACKS,
): Promise<string> {
  await mkdir(dir, { recursive: true })

  for (const [name, seconds] of tracks) {
    await writeFile(join(dir, name), await silence(seconds))
  }

  return dir
}

function chapterXhtml(
  id: string,
  title: string,
  paragraphs: string[],
  idStyle: "blocks" | "sections" | "first-only",
  extraBlocks: string[] = [],
): string {
  const blocks =
    idStyle === "blocks"
      ? paragraphs.map((p, i) => `<p id="${id}-p${i + 1}">${p}</p>`)
      : idStyle === "sections"
        ? [
            `<section id="${id}-body">`,
            ...paragraphs.map((p) => `<p>${p}</p>`),
            `</section>`,
          ]
        : paragraphs.map((p, i) =>
            i === 0 ? `<p id="${id}-p1">${p}</p>` : `<p>${p}</p>`,
          )

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<html xmlns="${XHTML_NS}" xml:lang="en"><head><title>${title}</title></head>`,
    `<body><h1 id="${id}-title">${title}</h1>`,
    ...blocks,
    ...extraBlocks,
    `</body></html>`,
  ].join("")
}

function smil(
  chapterFile: string,
  audioFile: string,
  pars: [id: string, clipBegin: string, clipEnd: string][],
): string {
  const id = chapterFile.replace(/\.xhtml$/, "")
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<smil xmlns="${SMIL_NS}" xmlns:epub="${EPUB_NS}" version="3.0"><body>`,
    `<seq id="${id}-overlay" epub:textref="../Text/${chapterFile}" epub:type="chapter">`,
    ...pars.map(
      ([pid, clipBegin, clipEnd]) =>
        `<par id="${pid}"><text src="../Text/${chapterFile}#${pid}"/>` +
        `<audio src="../Audio/${audioFile}" clipBegin="${clipBegin}s" clipEnd="${clipEnd}s"/></par>`,
    ),
    `</seq></body></smil>`,
  ].join("")
}

export async function buildEpub(
  dir: string,
  {
    overlays = false,
    gaps = false,
    name = "book",
    idStyle = "blocks",
    extraIds = false,
  }: {
    overlays?: boolean
    /** Spread the clips out so the timeline has holes in it. */
    gaps?: boolean
    name?: string
    idStyle?: "blocks" | "sections" | "first-only"
    extraIds?: boolean
  } = {},
): Promise<string> {
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${name}.epub`)

  const epub = await Epub.using(TmpFsAdapter).create(path, {
    title: "Progress Fixture",
    language: new Intl.Locale("en-US"),
    identifier: `urn:uuid:progress-fixture-${name}`,
  })

  const items: { item: ManifestItem; contents: string | Uint8Array }[] = [
    {
      item: {
        id: "chapter1",
        href: "Text/chapter1.xhtml",
        mediaType: "application/xhtml+xml",
        ...(overlays && { mediaOverlay: "chapter1-overlay" }),
      },
      contents: chapterXhtml(
        "ch1",
        "Chapter One",
        extraIds
          ? [
              "Call me Ishmael.",
              'Some ways later, <em id="ch1-em">we set sail</em>.',
            ]
          : ["Call me Ishmael.", "Some ways later, we set sail."],
        idStyle,
        extraIds
          ? [
              '<p id="ch1-note">A note on the whiteness.</p>',
              "<p>Some ways later still.</p>",
            ]
          : [],
      ),
    },
    {
      item: {
        id: "chapter2",
        href: "Text/chapter2.xhtml",
        mediaType: "application/xhtml+xml",
        ...(overlays && { mediaOverlay: "chapter2-overlay" }),
      },
      contents: chapterXhtml(
        "ch2",
        "Chapter Two",
        ["Later on, the crew slept."],
        idStyle,
      ),
    },
  ]

  if (overlays) {
    items.push(
      {
        item: {
          id: "chapter1-overlay",
          href: "MediaOverlays/chapter1.smil",
          mediaType: "application/smil+xml",
        },
        contents: gaps
          ? smil("chapter1.xhtml", "chapter1.mp3", [
              ["ch1-p1", "0", "9"],
              ["ch1-p2", "12", "15"],
              ["ch1-p1", "18", "20"],
            ])
          : smil("chapter1.xhtml", "chapter1.mp3", [
              ["ch1-p1", "0", "10"],
              ["ch1-p2", "10", "20"],
            ]),
      },
      {
        item: {
          id: "chapter2-overlay",
          href: "MediaOverlays/chapter2.smil",
          mediaType: "application/smil+xml",
        },
        contents: gaps
          ? smil("chapter2.xhtml", "chapter2.mp3", [["ch2-p1", "3", "10"]])
          : smil("chapter2.xhtml", "chapter2.mp3", [["ch2-p1", "0", "10"]]),
      },
      {
        item: {
          id: "chapter1-audio",
          href: "Audio/chapter1.mp3",
          mediaType: "audio/mpeg",
        },
        contents: await silence(AUDIO_1_SECONDS),
      },
      {
        item: {
          id: "chapter2-audio",
          href: "Audio/chapter2.mp3",
          mediaType: "audio/mpeg",
        },
        contents: await silence(AUDIO_2_SECONDS),
      },
    )
  }

  for (const { item, contents } of items) {
    if (typeof contents === "string") {
      await epub.addManifestItem(item, contents, "utf-8")
    } else {
      await epub.addManifestItem(item, contents)
    }
  }

  await epub.addSpineItem("chapter1")
  await epub.addSpineItem("chapter2")

  await epub.saveAndClose()

  return path
}

export function makeBook(assets: {
  ebook?: string | null
  readaloud?: string | null
  audiobook?: string | null
  readaloudStatus?: "ALIGNED" | "TRANSCRIBING"
}): BookWithRelations {
  const asset = (
    filepath: string | null | undefined,
    extra: Record<string, unknown> = {},
  ) =>
    filepath
      ? {
          uuid: randomUUID(),
          filepath,
          fingerprint: "fixture",
          missing: false,
          identifiers: [],
          cover: null,
          coverOrigin: "NONE",
          ...extra,
        }
      : null

  return {
    uuid: randomUUID(),
    title: "Progress Fixture",
    language: "en-US",
    ebook: asset(assets.ebook, { isEpub2: false, pageCount: 0 }),
    audiobook: asset(assets.audiobook, { duration: 30 }),
    readaloud: asset(assets.readaloud, {
      isEpub2: false,
      status: assets.readaloudStatus ?? "ALIGNED",
      pageCount: 0,
      duration: 30,
    }),
  } as unknown as BookWithRelations
}

/** A resolver output as `"path#fragment"` strings, for readable assertions. */
export function refStrings(
  refs: (UriReference | null | undefined)[] | null | undefined,
): string[] | null | undefined {
  if (!refs) return refs
  return refs.filter((ref) => !!ref).map((ref) => ref.href)
}
