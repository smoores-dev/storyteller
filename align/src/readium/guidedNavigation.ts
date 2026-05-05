import {
  GuidedNavigationDocument,
  GuidedNavigationObject,
  Link,
  Links,
  type LocalizedString,
  Manifest,
  Metadata,
  type Profile,
  Properties,
} from "@readium/shared"
import { camelCase } from "change-case"
import { enumerate } from "itertools"
import clockvalue from "smil-clockvalue"

import { lookupAudioMime } from "@storyteller-platform/audiobook"
import {
  Epub,
  type ManifestItem,
  type ParsedXml,
  type XmlElement,
} from "@storyteller-platform/epub"

export function generateGuidedNavigationManifest(
  title: LocalizedString,
  guidedNavDocs: GuidedNavigationDocument[],
) {
  const readingOrder: Link[] = []
  for (const doc of guidedNavDocs) {
    const href = doc.links?.findWithRel("self")?.href
    if (!href) continue

    const textref = doc.guided?.[0]?.textref
    if (!textref) continue

    const referencedAudioFiles: Record<
      string,
      { start: number; end: number | null }
    > = {}

    const pars = flatten(doc.guided ?? [])

    for (const par of pars) {
      if (!par.audioFile) continue

      const range = par.audioTime
      if (!range) continue
      const [startString, endString] = range.slice(2).split(",")
      const start = parseFloat(startString ?? "0")
      const end = endString ? parseFloat(endString) : null

      const existing = referencedAudioFiles[par.audioFile]
      if (!existing) {
        referencedAudioFiles[par.audioFile] = {
          start,
          end,
        }

        continue
      }

      existing.end = end
    }

    const audioReferences = Object.entries(referencedAudioFiles).map(
      ([audioFile, { start, end }]) => ({
        href: `${audioFile}#t=${start},${end}`,
        type: lookupAudioMime(audioFile),
      }),
    )

    readingOrder.push(
      new Link({
        href,
        type: "application/guided-navigation+json",
        properties: new Properties({
          references: [
            {
              href: textref,
              type: "application/xhtml+xml",
            },
            ...audioReferences,
          ],
        }),
      }),
    )
  }

  return new Manifest({
    metadata: new Metadata({
      title,
      conformsTo: [
        "https://readium.org/webpub-manifest/profiles/guided-navigation" as Profile,
      ],
    }),
    links: new Links([
      new Link({
        href: "manifest.json",
        type: "application/webpub+json",
        rels: new Set(["self"]),
      }),
    ]),
    readingOrder: new Links(readingOrder),
  })
}

export async function generateGuidedNavigationDocuments(epub: Epub) {
  const manifest = await epub.getManifest()
  const spine = await epub.getSpineItems()
  const mediaOverlays: ManifestItem[] = []

  for (const item of spine) {
    if (!item.mediaOverlay) continue

    const mediaOverlayItem = manifest[item.mediaOverlay]
    if (!mediaOverlayItem) continue

    mediaOverlays.push(mediaOverlayItem)
  }

  const guidedNavDocs: GuidedNavigationDocument[] = []

  for (const [i, overlay] of enumerate(mediaOverlays)) {
    const contents = await epub.readItemContents(overlay.id, "utf-8")
    const xml = Epub.xmlParser.parse(contents) as ParsedXml

    const body = Epub.findXmlDescendantByName("body", xml)

    if (!body) continue

    const links: Link[] = []
    const prevOverlay = mediaOverlays[i - 1]
    if (prevOverlay) {
      links.push(
        new Link({
          rels: new Set(["prev"]),
          href: `GND/${prevOverlay.id}.json`,
          type: "application/guided-navigation+json",
        }),
      )
    }

    links.push(
      new Link({
        rels: new Set(["self"]),
        href: `GND/${overlay.id}.json`,
        type: "application/guided-navigation+json",
      }),
    )

    const nextOverlay = mediaOverlays[i + 1]
    if (nextOverlay) {
      links.push(
        new Link({
          rels: new Set(["next"]),
          href: `GND/${nextOverlay.id}.json`,
          type: "application/guided-navigation+json",
        }),
      )
    }

    const guidedNavDoc = new GuidedNavigationDocument({
      links: new Links(links),
      guided: await parseGuidedNavigationObjects(
        epub,
        overlay.href,
        Epub.getXmlChildren(body),
      ),
    })

    guidedNavDocs.push(guidedNavDoc)
  }

  return guidedNavDocs
}

async function parseGuidedNavigationObjects(
  epub: Epub,
  overlayHref: string,
  xml: ParsedXml,
): Promise<GuidedNavigationObject[]> {
  const guidedNavObjects: GuidedNavigationObject[] = []

  const children = xml.filter(
    (node): node is XmlElement<"seq" | "par"> =>
      !Epub.isXmlTextNode(node) &&
      ["seq", "par"].includes(Epub.getXmlElementName(node)),
  )

  for (const element of children) {
    if (Epub.getXmlElementName(element) === "par") {
      const text = Epub.findXmlChildByName("text", Epub.getXmlChildren(element))
      const audio = Epub.findXmlChildByName(
        "audio",
        Epub.getXmlChildren(element),
      )

      if (!text || !audio) continue

      const textSrc = Epub.getXmlAttributes(text)["src"]
      const { src: audioSrc, clipBegin, clipEnd } = Epub.getXmlAttributes(audio)

      if (
        !textSrc ||
        !audioSrc ||
        clipBegin === undefined ||
        clipEnd === undefined
      ) {
        continue
      }

      const textref = await epub.resolveHref(textSrc, overlayHref, {
        toRoot: true,
      })
      const audioref = await epub.resolveHref(audioSrc, overlayHref, {
        toRoot: true,
      })

      const clipBeginSeconds = clockvalue(clipBegin) / 1000
      const clipEndSeconds = clockvalue(clipEnd) / 1000

      guidedNavObjects.push(
        new GuidedNavigationObject({
          // Slice off the leading slash
          textref: textref,
          audioref: `${audioref}#t=${clipBeginSeconds},${clipEndSeconds}`,
        }),
      )
    }

    if (Epub.getXmlElementName(element) === "seq") {
      const attrs = Epub.getXmlAttributes(element)
      const epubType = attrs["epub:type"]

      const role = epubType && camelCase(epubType)

      const textref = attrs["epub:textref"]

      if (!textref) continue

      const children = await parseGuidedNavigationObjects(
        epub,
        overlayHref,
        Epub.getXmlChildren(element),
      )

      guidedNavObjects.push(
        new GuidedNavigationObject({
          textref: await epub.resolveHref(textref, overlayHref, {
            toRoot: true,
          }),
          ...(role && { role: new Set([role]) }),
          children,
        }),
      )
    }
  }

  return guidedNavObjects
}

function flatten(input: GuidedNavigationObject[]): GuidedNavigationObject[] {
  const pars: GuidedNavigationObject[] = []
  for (const obj of input) {
    if (obj.children) {
      pars.push(...flatten(obj.children))
    } else {
      pars.push(obj)
    }
  }

  return pars
}
