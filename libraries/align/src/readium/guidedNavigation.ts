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
import { enumerate } from "itertools"
import clockvalue from "smil-clockvalue"

import {
  type Element,
  type Epub,
  findXmlChildByName,
  findXmlDescendantByName,
  type ManifestItem,
  parse,
} from "@storyteller-platform/epub"
import { MediaType } from "@storyteller-platform/media-types"

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
        type: MediaType.fromPath(audioFile)?.mime ?? null,
      }),
    )

    readingOrder.push(
      new Link({
        href,
        type: MediaType.GUIDED_NAVIGATION.mime,
        properties: new Properties({
          references: [
            {
              href: textref,
              type: MediaType.XHTML.mime,
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
        type: MediaType.WEBPUB_MANIFEST.mime,
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
    const xml = parse(contents, "text/xml")

    const root = xml.documentElement
    if (!root) continue

    const body = findXmlDescendantByName("body", root)

    if (!body) continue

    const links: Link[] = []
    const prevOverlay = mediaOverlays[i - 1]
    if (prevOverlay) {
      links.push(
        new Link({
          rels: new Set(["prev"]),
          href: `GND/${prevOverlay.id}.json`,
          type: MediaType.GUIDED_NAVIGATION.mime,
        }),
      )
    }

    links.push(
      new Link({
        rels: new Set(["self"]),
        href: `GND/${overlay.id}.json`,
        type: MediaType.GUIDED_NAVIGATION.mime,
      }),
    )

    const nextOverlay = mediaOverlays[i + 1]
    if (nextOverlay) {
      links.push(
        new Link({
          rels: new Set(["next"]),
          href: `GND/${nextOverlay.id}.json`,
          type: MediaType.GUIDED_NAVIGATION.mime,
        }),
      )
    }

    const guidedNavDoc = new GuidedNavigationDocument({
      links: new Links(links),
      guided: await parseGuidedNavigationObjects(epub, overlay.href, body),
    })

    guidedNavDocs.push(guidedNavDoc)
  }

  return guidedNavDocs
}

async function parseGuidedNavigationObjects(
  epub: Epub,
  overlayHref: string,
  root: Element,
): Promise<GuidedNavigationObject[]> {
  const guidedNavObjects: GuidedNavigationObject[] = []

  const children = Array.from(root.children).filter((node) =>
    ["seq", "par"].includes(node.nodeName),
  )

  for (const element of children) {
    if (element.nodeName === "par") {
      const text = findXmlChildByName("text", element)
      const audio = findXmlChildByName("audio", element)

      if (!text || !audio) continue

      const textSrc = text.getAttribute("src")
      const audioSrc = audio.getAttribute("src")
      const clipBegin = audio.getAttribute("clipBegin")
      const clipEnd = audio.getAttribute("clipEnd")

      if (!textSrc || !audioSrc || !clipBegin || !clipEnd) {
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

      const role = parseRoles(element.getAttribute("epub:type"))

      guidedNavObjects.push(
        new GuidedNavigationObject({
          textref: textref,
          audioref: `${audioref}#t=${clipBeginSeconds},${clipEndSeconds}`,
          ...(role && { role }),
        }),
      )
    }

    if (element.nodeName === "seq") {
      const role = parseRoles(element.getAttribute("epub:type"))

      const textref = element.getAttribute("epub:textref")

      if (!textref) continue

      const children = await parseGuidedNavigationObjects(
        epub,
        overlayHref,
        element,
      )

      guidedNavObjects.push(
        new GuidedNavigationObject({
          textref: await epub.resolveHref(textref, overlayHref, {
            toRoot: true,
          }),
          ...(role && { role }),
          children,
        }),
      )
    }
  }

  return guidedNavObjects
}

function parseRoles(epubType: string | null | undefined): Set<string> | null {
  const roles = (epubType ?? "").split(/\s+/).filter((r) => r.length > 0)
  return roles.length > 0 ? new Set(roles) : null
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
