import { readdir, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import {
  basename as posixBasename,
  extname as posixExtname,
} from "node:path/posix"

import { type Sentence } from "@echogarden/text-segmentation"

import {
  type Document,
  type Element,
  Epub,
  findXmlChildByName,
  getXhtmlBody,
  parse,
} from "@storyteller-platform/epub"
import { type EmissionResult } from "@storyteller-platform/ghost-story"
import { transliterate as romanize } from "@storyteller-platform/transliteration"

import { ctcGreedyDecode } from "../../align/ctc/greedyDecode.ts"
import { EmissionsReader } from "../../emit/fs.ts"
import { parseDom } from "../../markup/parseDom.ts"
import { segmentChapter } from "../../markup/segmentation.ts"
import { inlineFootnotes, liftText } from "../../markup/transform.ts"

export async function snapshotCtcAlignment(
  epubPath: string,
  emissionsPath: string,
  outputPath: string,
) {
  const emissionFilepaths = await readdir(emissionsPath).then((filenames) =>
    filenames
      .filter((f) => f.endsWith(".json"))
      .map((f) => join(emissionsPath, f)),
  )
  using epub = await Epub.from(epubPath)

  const snapshot = await createAlignmentSnapshot(
    epub,
    emissionFilepaths,
    "id-fragment",
  )

  await writeFile(outputPath, snapshot, { encoding: "utf-8" })
}

type EmissionTimings = Pick<
  EmissionResult,
  "secondsPerChunk" | "secondsPerFrame" | "framesPerChunk"
>

interface DecodedEmissions extends EmissionTimings {
  text: string
  frames: number[]
}

/**
 * Inverse of the chunk-aware frames→seconds conversion: chunk timing
 * is only valid for frame indices local to a single audio file.
 */
function secondsToFrame(seconds: number, timings: EmissionTimings) {
  const chunk = Math.floor(seconds / timings.secondsPerChunk)
  const localFrame = Math.round(
    (seconds - chunk * timings.secondsPerChunk) / timings.secondsPerFrame,
  )
  return (
    chunk * timings.framesPerChunk +
    Math.min(localFrame, timings.framesPerChunk - 1)
  )
}

async function loadDecodedEmissions(
  filepath: string,
): Promise<DecodedEmissions> {
  const emissionsReader = await EmissionsReader.from(filepath)
  const { text, frames } = await ctcGreedyDecode(emissionsReader)

  return {
    text,
    frames,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ...emissionsReader.timings[0]!,
  }
}

export async function createAlignmentSnapshot(
  epub: Epub,
  emissionFilepaths: string[],
  textRef: "id-fragment" | "text-fragment",
  transliterate?: boolean,
) {
  let newSnapshot = ""

  const decodedEmissionsCache = new Map<string, Promise<DecodedEmissions>>()
  function getDecodedEmissions(filepath: string) {
    let cached = decodedEmissionsCache.get(filepath)
    if (!cached) {
      cached = loadDecodedEmissions(filepath)
      decodedEmissionsCache.set(filepath, cached)
    }
    return cached
  }

  const locale = (await epub.getLanguage()) ?? new Intl.Locale("en-US")
  async function romanized(text: string) {
    return transliterate
      ? `       ${(await romanize(text, { locale })).result}\n`
      : ""
  }
  const spine = await epub.getSpineItems()
  const manifest = await epub.getManifest()
  const mediaOverlayItems = spine
    .map((item) => item.mediaOverlay)
    .filter((mediaOverlayId): mediaOverlayId is string => !!mediaOverlayId)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .map((id) => manifest[id]!)

  const mediaOverlays: Document[] = []
  for (const item of mediaOverlayItems) {
    const contents = await epub.readItemContents(item.id, "utf-8")
    const parsed = parse(contents, "text/xml")
    mediaOverlays.push(parsed)
    const smil = parsed.documentElement
    if (!smil) continue
    const body = findXmlChildByName("body", smil)
    if (!body) continue
    const seq = findXmlChildByName("seq", body)
    if (!seq) continue
    const textref = seq.getAttribute("epub:textref")
    if (!textref) continue
    newSnapshot += `// ${posixBasename(textref)}\n\n`
    const chapterContents = await epub.readFileContents(
      textref,
      item.href,
      "utf-8",
    )
    const chapterXml = parse(chapterContents, "application/xhtml+xml")
    const original = parseDom(getXhtmlBody(chapterXml))

    const inlined = inlineFootnotes(original)

    const lifted = liftText(inlined.root)

    const segmentation = await segmentChapter(lifted.result, {
      primaryLocale: new Intl.Locale("en-US"),
    })

    let lastChapterSentence = -1
    let lastTextSrc: string | null = null
    let audioClips: string[] = []
    let audioOffset = 0
    const chapterSentences = segmentation.filter((s) => s.text.match(/\S/))
    const pars = findAll("par", seq)
    for (const par of pars) {
      newSnapshot += `\n`
      const text = findXmlChildByName("text", par)
      if (!text) continue
      const audio = findXmlChildByName("audio", par)
      if (!audio) continue

      const textSrc = text.getAttribute("src")
      if (!textSrc) continue

      // A sentence cut across two audio files has one par per clip; render
      // the clips on the sentence's single Audio line, separated by "|"
      const continuation = textSrc === lastTextSrc
      lastTextSrc = textSrc

      if (continuation) {
        newSnapshot = newSnapshot.slice(0, -1)
      } else {
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
        const textSentence = chapterSentences[sentenceId]?.text.replace(
          /\n/,
          "",
        )
        if (!textSentence) continue

        lastChapterSentence = sentenceId

        if (textRef === "text-fragment") {
          newSnapshot += `${fragment}\n`
        }

        newSnapshot += `Text:  ${textSentence}\n${await romanized(textSentence)}`
      }

      const audioSrc = audio.getAttribute("src")
      if (!audioSrc) continue

      const audioStart = audio.getAttribute("clipBegin")
      const audioEnd = audio.getAttribute("clipEnd")
      if (!audioStart || !audioEnd) continue

      const audioStartTime = parseFloat(audioStart.slice(0, -1))
      const audioEndTime = parseFloat(audioEnd.slice(0, -1))

      const audioFilename = posixBasename(
        decodeURIComponent(audioSrc),
        posixExtname(audioSrc),
      )
      const emissionFilepath = emissionFilepaths.find((f) => {
        const withoutJson = basename(f, extname(f))
        return basename(withoutJson, extname(withoutJson)) === audioFilename
      })
      if (!emissionFilepath) continue

      const decoded = await getDecodedEmissions(emissionFilepath)

      const startFrame = secondsToFrame(audioStartTime, decoded)
      const endFrame = secondsToFrame(audioEndTime, decoded)

      let decodedSentence = ""
      for (let i = 0; i < decoded.frames.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const frame = decoded.frames[i]!
        if (frame > endFrame) break
        if (frame >= startFrame) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          decodedSentence += decoded.text[i]!
        }
      }

      if (continuation) {
        audioClips.push(decodedSentence)
        newSnapshot = newSnapshot.slice(0, audioOffset)
      } else {
        audioClips = [decodedSentence]
        audioOffset = newSnapshot.length
      }
      const audioText = audioClips.join("|")
      newSnapshot += `Audio: ${audioText}\n${await romanized(audioText)}`
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

function findAll(name: string, root: Element): Element[] {
  const result: Element[] = []

  for (const child of Array.from(root.children)) {
    if (child.nodeName === name) {
      result.push(child)
    }
    result.push(...findAll(name, child))
  }

  return result
}
