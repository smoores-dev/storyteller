import { copyFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { basename } from "node:path/posix"

import { type Logger } from "pino"

import {
  Epub,
  type ParsedXml,
  type XmlElement,
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
  chapterXml: ParsedXml,
  granularity: "word" | "sentence",
  locale: Intl.Locale | null,
) {
  const timing = createTiming()
  const html = Epub.findXmlChildByName("html", chapterXml)
  if (!html) throw new Error("Invalid XHTML document: no html element")

  const body = Epub.findXmlChildByName("body", html["html"])
  if (!body) throw new Error("Invalid XHTML document: No body element")

  clearBodyElement(chapterXml)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const taggedHtml = Epub.findXmlChildByName("html", chapterXml)!

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const taggedBody = Epub.findXmlChildByName("body", taggedHtml["html"])!

  const original = parseDom(Epub.getXmlChildren(body))

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
    taggedBody["body"] = serializeDom(replaced)
  })

  addStorytellerPrefix(taggedHtml)

  return { markedUp: chapterXml, timing }
}

function addStorytellerPrefix(html: XmlElement) {
  html[":@"] ??= {}
  html[":@"]["@_xmlns:epub"] = "http://www.idpf.org/2007/ops"

  const existingPrefixValue = html[":@"]["@_epub:prefix"]
  if (!existingPrefixValue) {
    html[":@"]["@_epub:prefix"] =
      "storyteller: https://storyteller-platform.dev/docs/vocabulary"
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

  html[":@"]["@_epub:prefix"] = Object.entries(prefixes)
    .map(([p, u]) => `${p}: ${u}`)
    .join("\n    ")
}

function clearBodyElement(xml: ParsedXml) {
  const html = Epub.findXmlChildByName("html", xml)
  if (!html) throw new Error("Invalid XHTML: Found no html element")

  const bodyIndex = html["html"].findIndex((element) => "body" in element)
  const body = html["html"][bodyIndex]
  if (!body) throw new Error("Invalid XHTML: Found no body element")

  html["html"].splice(bodyIndex, 1, {
    ...body,
    body: [],
  })
}
