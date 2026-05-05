import { readFile, readdir, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import {
  basename as posixBasename,
  extname as posixExtname,
} from "node:path/posix"

import { type Sentence } from "@echogarden/text-segmentation"

import {
  type ElementName,
  Epub,
  type ParsedXml,
  type XmlElement,
} from "@storyteller-platform/epub"
import {
  type RecognitionResult,
  startsWithSpacelessScript,
} from "@storyteller-platform/ghost-story"

import { parseDom } from "../markup/parseDom.ts"
import { segmentChapter } from "../markup/segmentation.ts"
import { inlineFootnotes, liftText } from "../markup/transform.ts"

export async function snapshotAlignment(
  epubPath: string,
  transcriptionsPath: string,
  outputPath: string,
) {
  const transcriptionFilepaths = await readdir(transcriptionsPath).then(
    (filenames) =>
      filenames
        .filter((f) => f.endsWith(".json"))
        .map((f) => join(transcriptionsPath, f)),
  )
  using epub = await Epub.from(epubPath)

  const snapshot = await createAlignmentSnapshot(
    epub,
    transcriptionFilepaths,
    "id-fragment",
  )

  await writeFile(outputPath, snapshot, { encoding: "utf-8" })
}

export async function createAlignmentSnapshot(
  epub: Epub,
  transcriptionFilepaths: string[],
  textRef: "id-fragment" | "text-fragment",
) {
  let newSnapshot = ""

  const manifest = await epub.getManifest()
  const mediaOverlayItems = Object.values(manifest)
    .map((item) => item.mediaOverlay)
    .filter((mediaOverlayId): mediaOverlayId is string => !!mediaOverlayId)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .map((id) => manifest[id]!)

  const mediaOverlays: ParsedXml[] = []
  for (const item of mediaOverlayItems) {
    const contents = await epub.readItemContents(item.id, "utf-8")
    const parsed = Epub.xmlParser.parse(contents) as ParsedXml
    mediaOverlays.push(parsed)
    const smil = Epub.findXmlChildByName("smil", parsed)
    if (!smil) continue
    const body = Epub.findXmlChildByName("body", Epub.getXmlChildren(smil))
    if (!body) continue
    const seq = Epub.findXmlChildByName("seq", Epub.getXmlChildren(body))
    if (!seq) continue
    const textref = seq[":@"]?.["@_epub:textref"]
    if (!textref) continue
    newSnapshot += `// ${posixBasename(textref)}\n\n`
    const chapterContents = await epub.readFileContents(
      textref,
      item.href,
      "utf-8",
    )
    const chapterXml = Epub.xhtmlParser.parse(chapterContents) as ParsedXml
    const original = parseDom(Epub.getXhtmlBody(chapterXml))

    const inlined = inlineFootnotes(original)

    const lifted = liftText(inlined.root)

    const segmentation = await segmentChapter(lifted.result, {
      primaryLocale: new Intl.Locale("en-US"),
    })

    let lastChapterSentence = -1
    const chapterSentences = segmentation.filter((s) => s.text.match(/\S/))
    const pars = findAll("par", Epub.getXmlChildren(seq))
    for (const par of pars) {
      newSnapshot += `\n`
      const text = Epub.findXmlChildByName("text", Epub.getXmlChildren(par))
      if (!text) continue
      const audio = Epub.findXmlChildByName("audio", Epub.getXmlChildren(par))
      if (!audio) continue

      const textSrc = text[":@"]?.["@_src"]
      if (!textSrc) continue
      const result =
        textRef === "id-fragment"
          ? getTextSentenceIndexByIdFragment(textSrc)
          : getTextSentenceIndexByTextFragment(
              textSrc,
              chapterSentences,
              lastChapterSentence,
            )

      if (result === null) continue

      const { fragment, sentenceId } = result
      const textSentence = chapterSentences[sentenceId]?.text
      if (!textSentence) continue

      lastChapterSentence = sentenceId

      if (textRef === "text-fragment") {
        newSnapshot += `${fragment}\n`
      }

      newSnapshot += `Text:  ${textSentence.replace(/\n/, "")}\n`

      const audioSrc = audio[":@"]?.["@_src"]
      if (!audioSrc) continue

      const audioStart = audio[":@"]?.["@_clipBegin"]
      const audioEnd = audio[":@"]?.["@_clipEnd"]
      if (!audioStart || !audioEnd) continue

      const audioStartTime = parseFloat(audioStart.slice(0, -1))
      const audioEndTime = parseFloat(audioEnd.slice(0, -1))

      const audioFilename = posixBasename(audioSrc, posixExtname(audioSrc))
      const transcriptionFilepath = transcriptionFilepaths.find(
        (f) => basename(f, extname(f)) === audioFilename,
      )
      if (!transcriptionFilepath) continue

      const transcription = JSON.parse(
        await readFile(transcriptionFilepath, { encoding: "utf-8" }),
      ) as Pick<RecognitionResult, "transcript" | "timeline">

      if ("wordTimeline" in transcription) {
        transcription.timeline =
          transcription.wordTimeline as RecognitionResult["timeline"]
      }

      const transcriptionWords: string[] = []
      let started = false
      let i = 0
      let word = transcription.timeline[i]
      while (word && word.endTime <= audioEndTime) {
        if (word.startTime >= audioStartTime) {
          started = true
        }
        if (started) {
          transcriptionWords.push(word.text)
        }
        word = transcription.timeline[++i]
      }

      const transcriptionSentence = transcriptionWords
        .map((w, idx) =>
          startsWithSpacelessScript(w) || idx === transcriptionWords.length - 1
            ? w
            : `${w} `,
        )
        .join("")
      newSnapshot += `Audio: ${transcriptionSentence}\n`
    }

    newSnapshot += `\n`
  }

  return newSnapshot
}

function getTextSentenceIndexByTextFragment(
  textSrc: string,
  chapterSentences: Sentence[],
  lastChapterSentence: number,
) {
  const textSrcMatch = textSrc.match(/#:~:text=(.+)$/)
  if (!textSrcMatch) return null
  const textFragment = textSrcMatch[1]
  if (textFragment === undefined) return null

  const textFragmentParts = textFragment.split(",")
  const textFragmentPrefix = textFragmentParts[0]?.endsWith("-")
    ? decodeURIComponent(textFragmentParts[0]).slice(0, -1)
    : ""
  const textFragmentStart = decodeURIComponent(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    textFragmentPrefix ? textFragmentParts[1]! : textFragmentParts[0]!,
  )

  const textSentenceIndex = chapterSentences
    .slice(lastChapterSentence + 1)
    .findIndex((s, i) => {
      const prev = chapterSentences[lastChapterSentence + i]
      return (
        (!prev ||
          prev.text
            .replace("\n", " ")
            .toLowerCase()
            .endsWith(textFragmentPrefix)) &&
        s.text.replace("\n", " ").toLowerCase().startsWith(textFragmentStart)
      )
    })

  if (textSentenceIndex === -1) return null

  return {
    fragment: textSrcMatch[0],
    sentenceId: textSentenceIndex + lastChapterSentence + 1,
  }
}

function getTextSentenceIndexByIdFragment(textSrc: string) {
  const match = textSrc.match(/#.*s([0-9]+)$/)
  if (!match) return null
  const [fragment, sentenceId] = match
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { fragment, sentenceId: parseInt(sentenceId!, 10) }
}

function findAll<Name extends ElementName>(
  name: Name,
  xml: ParsedXml,
): XmlElement<Name>[] {
  const result: XmlElement<Name>[] = []

  for (const child of xml) {
    if (Epub.isXmlTextNode(child)) continue
    if (Epub.getXmlElementName(child) === name) {
      result.push(child)
    }
    result.push(...findAll(name, Epub.getXmlChildren(child)))
  }

  return result
}
