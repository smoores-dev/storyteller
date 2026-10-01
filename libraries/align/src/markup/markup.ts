import { copyFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { basename } from "node:path/posix"

import { type Logger } from "pino"

import {
  Epub,
  type Document,
  type Element,
  findXmlChildByName,
  insert,
  NS,
} from "@storyteller-platform/epub"
import {
  type TimingAggregator,
  createAggregator,
  createTiming,
} from "@storyteller-platform/ghost-story"

import { Mark } from "./model.ts"
import { parseDom } from "./parseDom.ts"
import { segmentChapter } from "./segmentation.ts"
import { serializeDom } from "./serializeDom.ts"
import {
  addMark,
  inlineFootnotes,
  liftText,
  replaceFootnotes,
} from "./transform.ts"

export interface MarkupOptions {
  granularity?: "word" | "sentence"
  primaryLocale?: Intl.Locale
  onProgress?: (progress: number) => void
  logger?: Logger
}

export async function markup(
  input: string,
  output: string,
  options: MarkupOptions,
): Promise<TimingAggregator> {
  const timing = createAggregator()
  timing.setMetadata("granularity", options.granularity ?? "sentence")

  await mkdir(dirname(output), { recursive: true })
  await copyFile(input, output)

  using epub = await Epub.from(output)

  const primaryLocale = options.primaryLocale ?? (await epub.getLanguage())

  const spine = await epub.getSpineItems()
  const manifest = await epub.getManifest()

  for (let index = 0; index < spine.length; index++) {
    options.onProgress?.(index / spine.length)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const spineItem = spine[index]!

    options.logger?.info(
      `Marking up epub item #${index}: ${basename(spineItem.href)}`,
    )

    const chapterId = spineItem.id
    if (manifest[chapterId]?.properties?.includes("nav")) {
      continue
    }

    const chapterXml = await epub.readXhtmlItemContents(chapterId)

    const { markedUp, timing: chapterTiming } = await markupChapter(
      chapterId,
      chapterXml,
      options.granularity ?? "sentence",
      primaryLocale,
    )
    timing.add(chapterTiming.summary())

    await epub.writeXhtmlItemContents(chapterId, markedUp)
  }

  await epub.saveAndClose()

  return timing
}

export async function markupChapter(
  chapterId: string,
  chapterXml: Document,
  granularity: "word" | "sentence",
  locale: Intl.Locale | null,
) {
  const timing = createTiming()

  const html = chapterXml.documentElement
  if (!html) throw new Error("Invalid XHTML document: no html element")

  const body = findXmlChildByName("body", html)
  if (!body) throw new Error("Invalid XHTML document: No body element")

  const original = parseDom(body)

  const inlined = inlineFootnotes(original)

  const lifted = liftText(inlined.root)
  const invertedLiftMapping = lifted.mapping.invert()
  const cursor = invertedLiftMapping.cursor()

  const segmentation = await segmentChapter(lifted.result, {
    primaryLocale: locale,
  })

  timing.time("mark up", () => {
    let root = inlined.root
    let pos = 0
    let i = 0
    for (const sentence of segmentation) {
      if (granularity === "word") {
        const snapshot = cursor.value()
        let j = 0
        let wordPos = pos
        for (const word of sentence.words.entries) {
          if (!word.isPunctuation) {
            root = addMark(
              root,
              cursor.map(wordPos, "end"),
              cursor.map(
                wordPos + word.text.replace(/\n$/, "").length,
                "start",
              ),
              new Mark("span", {
                id: `${chapterId}-s${i}-w${j}`,
                "epub:type": "storyteller:word-span",
              }),
            )
            j++
          }
          wordPos += word.text.replace(/\n$/, "").length
        }
        cursor.reset(snapshot)
      }
      if (sentence.text.match(/\S/)) {
        root = addMark(
          root,
          cursor.map(pos, "end"),
          cursor.map(pos + sentence.text.replace(/\n$/, "").length, "start"),
          new Mark("span", {
            id: `${chapterId}-s${i}`,
            "epub:type": "storyteller:sentence-span",
          }),
        )
        i++
      }
      pos += sentence.text.replace(/\n$/, "").length
    }

    const replaced = replaceFootnotes(
      original,
      root,
      inlined.footnotePairs,
      inlined.mapping,
    )
    const markedUpBody = serializeDom(replaced)

    while (body.firstChild) body.removeChild(body.firstChild)
    for (const node of markedUpBody) insert(body, node)
  })

  addStorytellerPrefix(html)

  return { markedUp: chapterXml, timing }
}

function addStorytellerPrefix(html: Element) {
  // Both of these need setAttributeNS, never plain setAttribute, so that the
  // tree in memory matches the bytes written out.
  //
  // The declaration has to carry the XMLNS namespace: the serializer only
  // registers a prefix for its descendants when the declaration's `prefix` is
  // `"xmlns"`, which setAttribute never sets, and the result is otherwise a
  // redundant `xmlns:epub` on every generated span. `epub:prefix` is an
  // ordinary attribute in the epub namespace, which is also how `x()` builds
  // it everywhere else.
  html.setAttributeNS(NS.xmlns, "xmlns:epub", NS.epub)

  const existingPrefixValue = html.getAttribute("epub:prefix")
  if (!existingPrefixValue) {
    html.setAttributeNS(
      NS.epub,
      "epub:prefix",
      "storyteller: https://storyteller-platform.dev/docs/vocabulary",
    )
    return
  }

  const matches = existingPrefixValue.matchAll(/(?:([a-z]+): +(\S+)\s*)/gs)
  const existingPrefixes = Array.from(matches).reduce<Record<string, string>>(
    (acc, match) =>
      match[1] && match[2] ? { ...acc, [match[1]]: match[2] } : acc,
    {},
  )

  const prefixes = {
    ...existingPrefixes,
    storyteller: "https://storyteller-platform.dev/docs/vocabulary",
  }

  html.setAttributeNS(
    NS.epub,
    "epub:prefix",
    Object.entries(prefixes)
      .map(([p, u]) => `${p}: ${u}`)
      .join("\n    "),
  )
}
