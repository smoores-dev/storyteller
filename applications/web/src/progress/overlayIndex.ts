import clockvalue from "smil-clockvalue"

import {
  type Element,
  type EpubReader,
  type ManifestItem,
  findXmlChildByName,
  findXmlDescendantByName,
  parse,
} from "@storyteller-platform/epub"

import { type UriReference } from "@/progress/uriReference.ts"

export type OverlayIndex = {
  /** Audio file hrefs, relative to the package root. */
  audioHrefPathnames: string[]
  /** Where in `times` audio file's pars start, and the end of the last. */
  audioFileStarts: Int32Array
  /** Start and end of every par, in seconds, interleaved. */
  times: Float64Array
  /** Every par's `resource#anchor`, one after the other. */
  anchors: string
  /** Where every par's anchor starts in `anchors`, and the end. */
  anchorStart: Int32Array
  /** Par numbers, ordered by anchor. */
  byAnchor: Int32Array
}

type OverlayParallel = {
  audioref: string
  start: number
  end: number
  textref: string
}

export async function readOverlayIndex(
  epub: EpubReader,
): Promise<OverlayIndex> {
  const manifest = await epub.getManifest()
  const spine = await epub.getSpineItems()

  const overlays: ManifestItem[] = []
  for (const item of spine) {
    if (!item.mediaOverlay) continue

    const overlay = manifest[item.mediaOverlay]
    if (overlay) overlays.push(overlay)
  }

  const pars: OverlayParallel[] = []

  for (const overlay of overlays) {
    const contents = await epub.readItemContents(overlay.id, "utf-8")
    const document = parse(contents, "text/xml")
    const body = document.documentElement
      ? findXmlDescendantByName("body", document.documentElement)
      : null
    if (!body) continue

    const stack: Element[] = [...body.children]
    let element = stack.shift()

    while (element) {
      if (element.nodeName === "seq") {
        stack.unshift(...element.children)
      }

      if (element.nodeName === "par") {
        const annotation = await readPar(epub, overlay.href, element)
        if (annotation) pars.push(annotation)
      }

      element = stack.shift()
    }
  }

  return toOverlayIndex(pars)
}

async function readPar(
  epub: EpubReader,
  overlayHref: string,
  par: Element,
): Promise<OverlayParallel | null> {
  const text = findXmlChildByName("text", par)
  const audio = findXmlChildByName("audio", par)

  const textSrc = text?.getAttribute("src")
  const audioSrc = audio?.getAttribute("src")
  const clipBegin = audio?.getAttribute("clipBegin")
  const clipEnd = audio?.getAttribute("clipEnd")

  if (!textSrc || !audioSrc || !clipBegin || !clipEnd) return null

  const [resource, file] = await Promise.all([
    epub.resolveHref(textSrc, overlayHref, { toRoot: true }),
    epub.resolveHref(audioSrc, overlayHref, { toRoot: true }),
  ])

  // An par without an anchor cannot be used
  if (!resource.includes("#")) return null

  // Strip any fragment from audio src
  const audioAt = file.indexOf("#")

  return {
    audioref: audioAt === -1 ? file : file.slice(0, audioAt),
    start: clockvalue(clipBegin) / 1000,
    end: clockvalue(clipEnd) / 1000,
    textref: resource,
  }
}

function toOverlayIndex(pars: OverlayParallel[]): OverlayIndex {
  pars.sort((a, b) =>
    a.audioref === b.audioref
      ? a.start - b.start
      : a.audioref < b.audioref
        ? -1
        : 1,
  )

  const files: string[] = []
  const fileStart: number[] = []
  let previous = ""

  pars.forEach((annotation, i) => {
    if (annotation.audioref !== previous) {
      files.push(annotation.audioref)
      fileStart.push(i)
      previous = annotation.audioref
    }
  })
  fileStart.push(pars.length)

  const times = new Float64Array(pars.length * 2)
  const anchorStart = new Int32Array(pars.length + 1)

  let at = 0
  pars.forEach((annotation, i) => {
    times[i * 2] = annotation.start
    times[i * 2 + 1] = annotation.end
    anchorStart[i] = at
    at += annotation.textref.length
  })
  anchorStart[pars.length] = at

  const anchors = pars.map((annotation) => annotation.textref).join("")

  const byAnchor = Int32Array.from({ length: pars.length }, (_, i) => i).sort(
    (a, b) => {
      const left = pars[a]?.textref ?? ""
      const right = pars[b]?.textref ?? ""

      return left < right ? -1 : left > right ? 1 : 0
    },
  )

  return {
    audioHrefPathnames: files,
    audioFileStarts: Int32Array.from(fileStart),
    times,
    anchors,
    anchorStart,
    byAnchor,
  }
}

/**
 * The anchor of the element being read `seconds` into `file`.
 *
 * A timestamp between two annotations belongs to the one before it, which is
 * what a reader that has run past the end of a clip expects.
 */
export function resolveTimestampToAnchor(
  index: OverlayIndex,
  audioReference: UriReference,
): string | null {
  const seconds = timeOf(audioReference)
  if (seconds === null) return null

  const file = index.audioHrefPathnames.indexOf(audioReference.hrefPathname)
  if (file < 0) return null

  const from = entry(index.audioFileStarts, file)
  const to = entry(index.audioFileStarts, file + 1)

  // Nothing to resolve to outside the recorded range
  if (
    seconds < entry(index.times, from * 2) ||
    seconds >= entry(index.times, (to - 1) * 2 + 1)
  ) {
    return null
  }

  let low = from
  let high = to
  while (low < high) {
    const middle = (low + high) >>> 1
    if (entry(index.times, middle * 2) <= seconds) low = middle + 1
    else high = middle
  }

  return anchorAt(index, low - 1)
}

export function resolveAnchorToTimestamp(
  index: OverlayIndex,
  anchorReference: UriReference,
): string | null {
  const anchor = anchorReference.fragment.identifier
  if (anchor?.kind !== "anchor") return null

  const at = findAnchor(index, anchorReference.hrefPathname, anchor.value)
  if (at === null) return null

  const file = fileAt(index, at)
  if (file === null) return null

  return `${file}#t=${entry(index.times, at * 2)},${entry(index.times, at * 2 + 1)}`
}

export function isOverlayAnchor(
  index: OverlayIndex,
  resource: string,
  anchor: string,
): boolean {
  return findAnchor(index, resource, anchor) !== null
}

export function overlayAudioFiles(index: OverlayIndex): Set<string> {
  return new Set(index.audioHrefPathnames)
}

function timeOf(reference: UriReference): number | null {
  const identifier = reference.fragment.identifier
  if (identifier?.kind !== "media") return null

  return identifier.media.temporal?.parsedTimeStart ?? null
}

function anchorAt(index: OverlayIndex, at: number): string | null {
  if (at < 0 || at >= index.byAnchor.length) return null

  return index.anchors.slice(
    entry(index.anchorStart, at),
    entry(index.anchorStart, at + 1),
  )
}

function annotationAt(index: OverlayIndex, at: number): number | null {
  return index.byAnchor[at] ?? null
}

// Binary search for textref
function findAnchor(
  index: OverlayIndex,
  resource: string,
  anchor: string,
): number | null {
  const needle = `${resource}#${anchor}`

  let low = 0
  let high = index.byAnchor.length

  while (low < high) {
    const middle = (low + high) >>> 1
    const candidate = anchorAt(index, annotationAt(index, middle) ?? -1) ?? ""

    if (candidate < needle) low = middle + 1
    else high = middle
  }

  const at = annotationAt(index, low)
  if (at === null) return null

  return anchorAt(index, at) === needle ? at : null
}

function fileAt(index: OverlayIndex, at: number): string | null {
  let file = 0
  while (entry(index.audioFileStarts, file + 1) <= at) file += 1

  return index.audioHrefPathnames[file] ?? null
}

function entry(values: Int32Array | Float64Array, at: number): number {
  const value = values[at]
  if (value === undefined) {
    throw new RangeError(`The overlay index has no entry ${at}`)
  }

  return value
}
