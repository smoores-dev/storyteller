import {
  Contributor,
  Contributors,
  Layout,
  Link,
  Links,
  LocalizedString,
  Manifest,
  Metadata,
  Profile,
  Properties,
  PublicationCollection,
  ReadingProgression,
  Subject,
  Subjects,
} from "@readium/shared"
import clockvalue from "smil-clockvalue"

import type {
  DcCreator,
  EpubReader,
  NavigationList,
} from "@storyteller-platform/epub"

import {
  type ReadiumWebPublicationManifest,
  type Rel,
} from "./manifest.types.ts"

export interface ReadiumManifestOptions {
  /**
   * if true, infer a `numberOfPages`
   * uses the compressed size of the entries, see {@link https://github.com/readium/architecture/issues/123}
   */
  inferPageCount?: boolean
  signal?: AbortSignal
}

const BYTES_PER_PAGE = 1024

/**
 * build a Readium WebPub manifest for an EPUB
 */
export async function generateReadiumManifest(
  epub: EpubReader,
  options: ReadiumManifestOptions = {},
) {
  const primaryLocale = (await epub.getLanguage()) ?? new Intl.Locale("en-US")

  const creators = await epub.getCreators()

  const authors = creators
    .filter((contributor) => contributor.role === "aut")
    .map((author) => createContributor(author, primaryLocale))
  const artists = creators
    .filter((contributor) => contributor.role === "art")
    .map((author) => createContributor(author, primaryLocale))
  const colorists = creators
    .filter((contributor) => contributor.role === "clr")
    .map((author) => createContributor(author, primaryLocale))
  const contributors = (await epub.getContributors()).map((author) =>
    createContributor(author, primaryLocale),
  )
  const editors = creators
    .filter((contributor) => contributor.role === "clr")
    .map((author) => createContributor(author, primaryLocale))
  const illustrators = creators
    .filter((contributor) => contributor.role === "ill")
    .map((author) => createContributor(author, primaryLocale))
  const inkers = creators
    .filter((contributor) => contributor.role === "ink")
    .map((author) => createContributor(author, primaryLocale))
  const letterers = creators
    .filter((contributor) => contributor.role === "ltr")
    .map((author) => createContributor(author, primaryLocale))
  const narrators = creators
    .filter((contributor) => contributor.role === "nrt")
    .map((author) => createContributor(author, primaryLocale))
  const pencilers = creators
    .filter((contributor) => contributor.role === "pnc")
    .map((author) => createContributor(author, primaryLocale))
  const translators = creators
    .filter((contributor) => contributor.role === "trl")
    .map((author) => createContributor(author, primaryLocale))
  const publishers = creators
    .filter((contributor) => contributor.role === "pbl")
    .map((author) => createContributor(author, primaryLocale))

  const dcSubjects = await epub.getSubjects()
  const subjects = dcSubjects.map<Subject>((subject) => {
    if (typeof subject === "string") {
      return new Subject({
        // TODO: should this be in primary locale?
        name: new LocalizedString(subject),
      })
    }
    return new Subject({
      // TODO: should this be in primary locale?
      name: new LocalizedString(subject.value),
      scheme: subject.authority,
      code: subject.term,
    })
  })

  const collections = await epub.getCollections()
  const belongsToCollections = collections
    .filter((collection) => collection.type === "set")
    .map(
      (collection) =>
        new Contributor({ name: new LocalizedString(collection.name) }),
    )

  const belongsToSeries = collections
    .filter((collection) => collection.type === "series")
    .map(
      (collection) =>
        new Contributor({
          name: new LocalizedString(collection.name),
          ...(collection.position !== undefined && {
            position: parseFloat(collection.position),
          }),
        }),
    )

  const title = await epub.getTitle()
  const identifier = await epub.getIdentifier()
  const subtitle = await epub.getSubtitle()
  const description = await epub.getDescription()
  const published = await epub.getPublicationDate()
  const modified = await epub.getModifiedDate()
  const layout = await epub.getLayout()
  const dir = await epub.getBaseDirection()

  const epubMetadata = await epub.getMetadata()

  const vocab = await epub.getPackageVocabularyPrefixes()

  const duration = epubMetadata.find(
    ({ properties }) => properties["property"] === "media:duration",
  )?.value
  const durationMs = duration !== undefined ? clockvalue(duration) : undefined

  const otherMetadata = epubMetadata
    .filter(
      (meta) => (meta.properties["property"]?.split(":")[0] ?? "") in vocab,
    )
    .map((meta) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [prefix, property] = meta.properties["property"]!.split(":")
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const scheme = vocab[prefix!]!
      return [`${scheme}#${property}`, meta.value] as const
    })

  const spine = await epub.getSpineItems()
  const epubManifest = await epub.getManifest()

  const numberOfPages = options.inferPageCount
    ? await inferPageCount(epub, spine, options.signal)
    : undefined

  const metadata = new Metadata({
    title: new LocalizedString(title ?? ""),
    conformsTo: [Profile.EPUB],
    ...(identifier && { identifier }),
    ...(subtitle && { subtitle: new LocalizedString(subtitle) }),
    authors: new Contributors(authors),
    artists: new Contributors(artists),
    colorists: new Contributors(colorists),
    contributors: new Contributors(contributors),
    editors: new Contributors(editors),
    illustrators: new Contributors(illustrators),
    inkers: new Contributors(inkers),
    letterers: new Contributors(letterers),
    narrators: new Contributors(narrators),
    pencilers: new Contributors(pencilers),
    translators: new Contributors(translators),
    publishers: new Contributors(publishers),
    languages: [primaryLocale.toString()],
    ...(description && { description }),
    ...(published && { published }),
    ...(modified && { modified }),
    subjects: new Subjects(subjects),
    belongsToCollections: new Contributors(belongsToCollections),
    belongsToSeries: new Contributors(belongsToSeries),
    layout: layout === "reflowable" ? Layout.reflowable : Layout.fixed,
    ...(dir !== "auto" && {
      readingProgression:
        dir === "ltr" ? ReadingProgression.ltr : ReadingProgression.rtl,
    }),
    // TODO: is this meant to be in milliseconds (as here) or seconds?
    ...(durationMs !== undefined && { duration: durationMs }),
    ...(numberOfPages !== undefined && { numberOfPages }),
    otherMetadata: Object.fromEntries(otherMetadata),
  })

  const readingOrder = await Promise.all(
    spine.map(async (item) => {
      const link = new Link({
        href: await epub.resolveHref(item.href, undefined, { toRoot: true }),
        ...(item.mediaType && { type: item.mediaType }),
      })
      const manifestItem = epubManifest[item.id]
      if (!manifestItem) return link
      if (!manifestItem.mediaOverlay) return link

      const mediaOverlayItem = epubManifest[manifestItem.mediaOverlay]
      if (!mediaOverlayItem) return link

      return new Link({
        href: link.href,
        type: link.mediaType.string,
        alternates: new Links([
          new Link({
            href: `GND/${mediaOverlayItem.id}.json`,
            type: "application/guided-navigation+json",
          }),
        ]),
      })
    }),
  )

  const coverItem = await epub.getCoverImageItem()

  const resources = await Promise.all(
    Object.values(epubManifest).map(async (item) => {
      const rels = new Set<Rel>()

      if (item.id === coverItem?.id) {
        rels.add("cover")
      }

      if (item.mediaType === "application/xhtml+xml") {
        rels.add("contents")
      }

      const otherResourceMetadata = epubMetadata
        .filter((meta) => meta.properties["refines"] === `#${item.id}`)
        .filter(
          (meta) => (meta.properties["property"]?.split(":")[0] ?? "") in vocab,
        )
        .map((meta) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const prefix = meta.properties["property"]!.split(":")[0]!
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const scheme = vocab[prefix]!
          return [scheme, meta.value] as const
        })

      const link = new Link({
        href: await epub.resolveHref(item.href, undefined, { toRoot: true }),
        ...(item.mediaType && { type: item.mediaType }),
        rels,
        properties: new Properties(Object.fromEntries(otherResourceMetadata)),
      })

      if (!item.mediaOverlay) return link

      const mediaOverlayItem = epubManifest[item.id]
      if (!mediaOverlayItem) return link

      const refinedBy = epubMetadata.find(
        ({ properties }) =>
          properties["property"] === "media:duration" &&
          properties["refines"] === `#${mediaOverlayItem.id}`,
      )

      if (!refinedBy?.value) return link

      const itemDuration = clockvalue(refinedBy.value)

      return new Link({
        href: link.href,
        type: link.mediaType.string,
        ...(link.properties && { properties: link.properties }),
        duration: itemDuration,
      })
    }),
  )

  const epubToc = await epub.getTableOfContents({ resolveToRoot: true })
  const toc = epubToc && createLinkTree(epubToc.children)

  const epubLandmarks = await epub.getLandmarks({ resolveToRoot: true })
  const landmarks = epubLandmarks && createLinkTree(epubLandmarks.children)

  const epubPageList = await epub.getPageList({ resolveToRoot: true })
  const pageList = epubPageList && createLinkTree(epubPageList.children)

  const subcollections = new Map<string, PublicationCollection[]>()
  if (landmarks) {
    subcollections.set("landmarks", [
      new PublicationCollection({
        links: new Links(landmarks),
      }),
    ])
  }

  if (pageList) {
    subcollections.set("pageList", [
      new PublicationCollection({
        links: new Links(pageList),
      }),
    ])
  }

  const manifest = new Manifest({
    context: ["https://readium.org/webpub-manifest/context.jsonld"],
    metadata,
    readingOrder: new Links(readingOrder),
    resources: new Links(resources),
    links: new Links([
      new Link({
        href: "manifest.json",
        type: "application/webpub+json",
        rels: new Set(["self"]),
      }),
    ]),
    ...(toc && { toc: new Links(toc) }),
    subcollections,
  })

  return manifest.serialize() as ReadiumWebPublicationManifest
}

async function inferPageCount(
  epub: EpubReader,
  spine: Awaited<ReturnType<EpubReader["getSpineItems"]>>,
  signal?: AbortSignal,
): Promise<number | undefined> {
  let total = 0
  for (const item of spine) {
    if (signal?.aborted) {
      throw new (
        signal.reason instanceof Error
          ? (signal.reason.constructor as ErrorConstructor)
          : Error
      )(
        signal.reason instanceof Error
          ? signal.reason.message
          : "Aborted while inferring page count",
      )
    }
    if (item.mediaType !== "application/xhtml+xml") continue
    try {
      // matches weird readium strat https://github.com/readium/architecture/issues/123
      const length = await epub.getItemArchiveLength(item.id)
      total += Math.max(1, Math.ceil(length / BYTES_PER_PAGE))
    } catch {
      // a missing or unreadable spine item shouldn't fail the whole
      // manifest. fall back to a single page for the item.
      total += 1
    }
  }
  return total > 0 ? total : undefined
}

function createContributor(dcCreator: DcCreator, primaryLocale: Intl.Locale) {
  return new Contributor({
    name: new LocalizedString(
      Object.fromEntries([
        [primaryLocale.toString(), dcCreator.name] as [string, string],
        ...(dcCreator.alternateScripts?.map<[string, string]>((alt) => [
          alt.locale.toString(),
          alt.name,
        ]) ?? []),
      ]),
    ),
    ...(dcCreator.role && { roles: new Set([dcCreator.role]) }),
    ...(dcCreator.fileAs !== undefined && {
      sortAs: new LocalizedString(dcCreator.fileAs),
    }),
  })
}

function createLinkTree(navList: NavigationList): Link[] {
  return navList.map(
    (navItem) =>
      new Link({
        title: navItem.title,
        href: navItem.href ?? "#",
        ...(navItem.children && {
          children: new Links(createLinkTree(navItem.children)),
        }),
      }),
  )
}
