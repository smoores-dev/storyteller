import { copyFile } from "node:fs/promises"
import { basename } from "node:path/posix"

import { type Sentence } from "@echogarden/text-segmentation"
import { type Logger } from "pino"

import { Epub, type ParsedXml } from "@storyteller-platform/epub"
import {
  type TimingAggregator,
  createAggregator,
  createTiming,
} from "@storyteller-platform/ghost-story"

import { type Mapping } from "./map.ts"
import { Mark } from "./model.ts"
import { parseDom } from "./parseDom.ts"
import { getXhtmlSegmentation } from "./segmentation.ts"
import { serializeDom } from "./serializeDom.ts"
import { addMark } from "./transform.ts"

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

    const { result: segmentation, mapping } = await getXhtmlSegmentation(
      Epub.getXhtmlBody(chapterXml),
      { primaryLocale: primaryLocale },
    )

    const { markedUp, timing: chapterTiming } = markupChapter(
      chapterId,
      chapterXml,
      segmentation,
      mapping,
    )
    timing.add(chapterTiming.summary())

    await epub.writeXhtmlItemContents(chapterId, markedUp)
  }

  await epub.saveAndClose()

  return timing
}

export function markupChapter(
  chapterId: string,
  chapterXml: ParsedXml,
  segmentation: Sentence[],
  mapping: Mapping,
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

  timing.time("mark up", () => {
    let root = parseDom(Epub.getXmlChildren(body))
    let pos = 0
    let i = 0
    for (const sentence of segmentation) {
      if (sentence.text.match(/\S/)) {
        root = addMark(
          root,
          mapping.invert().map(pos),
          mapping
            .invert()
            .map(pos + sentence.text.replace(/\n$/, "").length, -1),
          new Mark("span", { id: `${chapterId}-s${i}` }),
        )
        i++
      }

      pos += sentence.text.replace(/\n$/, "").length
    }
    taggedBody["body"] = serializeDom(root)
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
