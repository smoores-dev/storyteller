import { copyFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { basename } from "node:path/posix"

import { type Logger } from "pino"

import { Epub, type ParsedXml } from "@storyteller-platform/epub"
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

  const segmentation = await segmentChapter(lifted.result, {
    primaryLocale: locale,
  })

  timing.time("mark up", () => {
    let root = inlined.root
    let pos = 0
    let i = 0
    for (const sentence of segmentation) {
      if (granularity === "word") {
        let j = 0
        let wordPos = pos
        for (const word of sentence.words.entries) {
          if (!word.isPunctuation) {
            root = addMark(
              root,
              lifted.mapping.invert().map(wordPos),
              lifted.mapping
                .invert()
                .map(wordPos + word.text.replace(/\n$/, "").length, -1),
              new Mark("span", { id: `${chapterId}-s${i}-w${j}` }),
            )
            j++
          }
          wordPos += word.text.replace(/\n$/, "").length
        }
      }
      if (sentence.text.match(/\S/)) {
        root = addMark(
          root,
          lifted.mapping.invert().map(pos),
          lifted.mapping
            .invert()
            .map(pos + sentence.text.replace(/\n$/, "").length, -1),
          new Mark("span", { id: `${chapterId}-s${i}` }),
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

  return { markedUp: chapterXml, timing }
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
